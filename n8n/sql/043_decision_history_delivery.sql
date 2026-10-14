BEGIN;
CREATE OR REPLACE FUNCTION tbs_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b jsonb; a jsonb; r jsonb; context text;
BEGIN
  IF TG_OP <> 'INSERT' THEN b := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN a := to_jsonb(NEW); END IF;
  -- Timestamp-only quota saves are not meaningful changes.
  IF TG_OP = 'UPDATE' AND (b - 'updated_at') = (a - 'updated_at') THEN RETURN NEW; END IF;
  r := COALESCE(a,b);
  context := current_setting('app.tbs_action', true);
  INSERT INTO tbs_change_history(entity,record_id,user_id,action,actor,before_value,after_value)
  VALUES (TG_TABLE_NAME,
    CASE WHEN TG_TABLE_NAME='leave_requests' THEN r->>'id'
      WHEN TG_TABLE_NAME='leave_quotas' THEN (r->>'user_id') || ':' || (r->>'year') ELSE r->>'user_id' END,
    r->>'user_id',
    CASE WHEN TG_TABLE_NAME='leave_requests' AND context IN ('cancel','restore','approve','reject') THEN context ELSE lower(TG_OP) END,
    COALESCE(NULLIF(current_setting('app.tbs_actor_label',true),''), CASE WHEN current_setting('app.tbs_channel',true)='line' THEN 'LINE — user not identified' WHEN COALESCE(context,'') <> '' THEN 'Dashboard — user not identified' ELSE 'Database change — user not identified' END),
    b,a);
  RETURN COALESCE(NEW,OLD);
END;
$$;

-- Capture identity at the authenticated entry point, never from caller-supplied display text.
DO $$ BEGIN
 IF to_regprocedure('tbs_line_decision_before_audit(text,jsonb)') IS NULL THEN
 ALTER FUNCTION tbs_line_decision(text,jsonb) RENAME TO tbs_line_decision_before_audit; END IF;
 IF to_regprocedure('tbs_dashboard_auth_before_audit(jsonb)') IS NULL THEN
 ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_audit; END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_line_decision(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; label text; previous text:=COALESCE(current_setting('app.tbs_actor_label',true),'');
BEGIN
 IF operation='reject' AND COALESCE(payload->>'accountId','')='' THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Open the current rejection form and sign in through LINE.');END IF;
 SELECT COALESCE(NULLIF(e.nickname,''),NULLIF(concat_ws(' ',e.first_name,e.last_name),'')) || ' · LINE' INTO label
 FROM tbs_employees e WHERE e.user_id=tbs_resolve_employee(payload->>'accountId');
 PERFORM set_config('app.tbs_actor_label',COALESCE(label,'LINE — user not identified'),true);
 result:=tbs_line_decision_before_audit(operation,payload);
 PERFORM set_config('app.tbs_actor_label',previous,true);RETURN result;
END $$;

CREATE TABLE IF NOT EXISTS tbs_calendar_sync_state(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 run_token uuid, lease_until timestamptz, next_at timestamptz NOT NULL DEFAULT now(),
 last_started_at timestamptz,last_success_at timestamptz,last_error text, failures integer NOT NULL DEFAULT 0
);
INSERT INTO tbs_calendar_sync_state(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_delivery_incidents(
 id bigserial PRIMARY KEY, source text NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz, alert_job uuid REFERENCES tbs_sync_jobs(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tbs_open_delivery_incident ON tbs_delivery_incidents(source) WHERE resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS tbs_delivery_admin(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),line_id text NOT NULL);
INSERT INTO tbs_delivery_admin VALUES(true,'U102590590d02874df5cac949938eb141') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION tbs_open_delivery_alert(source_key text,channel text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE incident bigint; job uuid; recipient text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('tbs_admin_delivery_alert'));
 INSERT INTO tbs_delivery_incidents(source) VALUES(source_key) ON CONFLICT(source) WHERE resolved_at IS NULL DO NOTHING RETURNING id INTO incident;
 IF incident IS NULL THEN RETURN; END IF;
 -- A provider outage must not send Dale one alert per employee.
 IF source_key<>'calendar' AND EXISTS(SELECT 1 FROM tbs_delivery_incidents WHERE source<>'calendar' AND alert_job IS NOT NULL AND opened_at>now()-interval '5 minutes') THEN RETURN;END IF;
 SELECT line_id INTO recipient FROM tbs_delivery_admin WHERE singleton;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',recipient,jsonb_build_object('to',recipient,'messages',jsonb_build_array(jsonb_build_object('type','text','text',
 'TBS HR · Delivery alert for Dale'||chr(10)||channel||' needs attention. Open Delivery alerts to review and retry. Leave decisions are saved independently.'||chr(10)||'https://tbs-hr-leave.vercel.app/ceo?view=delivery')))) RETURNING id INTO job;
 UPDATE tbs_delivery_incidents SET alert_job=job WHERE id=incident;
END $$;
CREATE OR REPLACE FUNCTION tbs_track_line_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind<>'line' THEN RETURN NEW; END IF;
 IF NEW.completed_generation>=NEW.generation OR NEW.retired_at IS NOT NULL THEN
  UPDATE tbs_delivery_incidents SET resolved_at=now() WHERE source=NEW.id::text AND resolved_at IS NULL;
 ELSIF (NEW.last_error IS NOT NULL OR NEW.blocked) AND NOT EXISTS(SELECT 1 FROM tbs_delivery_incidents WHERE alert_job=NEW.id) THEN
  PERFORM tbs_open_delivery_alert(NEW.id::text,'LINE notification');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_track_line_failure ON tbs_sync_jobs;
CREATE TRIGGER tbs_track_line_failure AFTER UPDATE ON tbs_sync_jobs FOR EACH ROW EXECUTE FUNCTION tbs_track_line_failure();

CREATE OR REPLACE FUNCTION tbs_claim_calendar_sync() RETURNS SETOF tbs_calendar_sync_state LANGUAGE plpgsql AS $$
DECLARE s tbs_calendar_sync_state%ROWTYPE;
BEGIN
 SELECT * INTO s FROM tbs_calendar_sync_state WHERE singleton FOR UPDATE;
 IF s.lease_until>now() OR s.next_at>now() THEN RETURN; END IF;
 IF s.run_token IS NOT NULL THEN
  UPDATE tbs_calendar_sync_state SET last_error='Previous sync did not finish',failures=failures+1 WHERE singleton;
  PERFORM tbs_open_delivery_alert('calendar','Google Calendar sync');
 END IF;
 UPDATE tbs_calendar_sync_state SET run_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',last_started_at=now(),next_at=now()+interval '5 minutes' WHERE singleton RETURNING * INTO s;
 RETURN NEXT s;
END $$;
CREATE OR REPLACE FUNCTION tbs_finish_calendar_sync(token uuid,error_message text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 UPDATE tbs_calendar_sync_state SET run_token=NULL,lease_until=NULL,next_at=now()+interval '5 minutes',
 last_error=left(error_message,500),last_success_at=CASE WHEN error_message IS NULL THEN now() ELSE last_success_at END,
 failures=CASE WHEN error_message IS NULL THEN 0 ELSE failures+1 END WHERE singleton AND run_token=token;
 IF NOT FOUND THEN RETURN false; END IF;
 IF error_message IS NOT NULL THEN PERFORM tbs_open_delivery_alert('calendar','Google Calendar sync');
 ELSE UPDATE tbs_delivery_incidents SET resolved_at=now() WHERE source='calendar' AND resolved_at IS NULL; END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION tbs_delivery_status() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('ok',true,'admin','Dale',
 'pending',(SELECT count(*) FROM tbs_sync_jobs WHERE kind='line' AND retired_at IS NULL AND completed_generation<generation),
 'failed',(SELECT count(*) FROM tbs_sync_jobs WHERE kind='line' AND retired_at IS NULL AND completed_generation<generation AND (blocked OR last_error IS NOT NULL)),
 'calendar',(SELECT jsonb_build_object('lastSuccess',last_success_at,'lastStarted',last_started_at,'error',last_error,'running',COALESCE(lease_until>now(),false),'nextAt',next_at,'failures',failures) FROM tbs_calendar_sync_state WHERE singleton),
 'jobs',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
 SELECT j.id,j.kind,j.attempts,j.blocked,j.created_at AS "createdAt",j.updated_at AS "updatedAt",j.last_error AS error,
 COALESCE(j.lease_token IS NOT NULL AND j.lease_until>now(),false) AS running,
 COALESCE(j.first_attempt_at<now()-interval '23 hours',false) AS "needsResend",
 CASE WHEN j.blocked THEN 'Needs delivery review' WHEN j.last_error IS NOT NULL THEN 'Retry scheduled' ELSE 'Queued' END status,
 COALESCE(NULLIF(concat_ws(' ',e.first_name,e.last_name),''),'LINE recipient') name
 FROM tbs_sync_jobs j LEFT JOIN tbs_employees e ON e.user_id=j.user_id
 WHERE j.kind='line' AND j.retired_at IS NULL AND j.completed_generation<j.generation
 ORDER BY j.blocked DESC,(j.last_error IS NOT NULL) DESC,j.delivery_order LIMIT 100) x),'[]'::jsonb));
$$;
CREATE OR REPLACE FUNCTION tbs_retry_delivery(payload jsonb,actor tbs_dashboard_accounts) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j tbs_sync_jobs%ROWTYPE; new_id uuid; s tbs_calendar_sync_state%ROWTYPE;
BEGIN
 IF actor.id IS NULL OR actor.role NOT IN ('admin','ceo') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Admin or CEO access required');END IF;
 IF payload->>'kind'='calendar' THEN
  SELECT * INTO s FROM tbs_calendar_sync_state WHERE singleton FOR UPDATE;
  IF s.lease_until>now() THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Calendar sync is already running');END IF;
  UPDATE tbs_calendar_sync_state SET next_at=now() WHERE singleton;
 ELSE
  SELECT * INTO j FROM tbs_sync_jobs WHERE id=(tbs_retry_delivery.payload->>'id')::uuid AND kind='line' FOR UPDATE;
  IF NOT FOUND OR j.retired_at IS NOT NULL OR j.completed_generation>=j.generation THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Delivery already completed or replaced. Refresh.');END IF;
  IF j.lease_token IS NOT NULL AND j.lease_until>now() THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Delivery is already running');END IF;
  IF j.first_attempt_at<now()-interval '23 hours' THEN
   IF payload->>'confirmResend' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','LINE duplicate-protection window expired. Confirm a new send; the recipient may receive a duplicate.');END IF;
   IF NOT tbs_sick_job_allowed(j.id) THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This reminder is no longer applicable');END IF;
   INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',j.user_id,j.payload) RETURNING id INTO new_id;
   UPDATE tbs_sick_alert_jobs SET job_id=new_id WHERE job_id=j.id;
   UPDATE tbs_sick_milestones SET job_id=new_id WHERE job_id=j.id;
   UPDATE tbs_personal_alerts SET job_id=new_id WHERE job_id=j.id;
   UPDATE tbs_delivery_incidents SET alert_job=new_id WHERE alert_job=j.id;
   UPDATE tbs_sync_jobs SET retired_at=now(),retirement_reason='Explicit resend by '||actor.username,blocked=true WHERE id=j.id;
  ELSE UPDATE tbs_sync_jobs SET lease_until=NULL,lease_token=NULL,blocked=false,updated_at=now() WHERE id=j.id; END IF;
 END IF;
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'delivery-retry',COALESCE(payload->>'id','calendar'));
 RETURN jsonb_build_object('ok',true,'queued',true);
END $$;

CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; result jsonb; cohort text:=COALESCE(payload->>'cohort','employee'); previous text:=COALESCE(current_setting('app.tbs_actor_label',true),'');
BEGIN
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF payload->>'operation' IN ('history','delivery-status','delivery-retry') THEN
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required');END IF;
  IF payload->>'operation' LIKE 'delivery-%' THEN
   IF actor.role NOT IN ('admin','ceo') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Delivery administration is restricted');END IF;
   IF payload->>'operation'='delivery-status' THEN RETURN tbs_delivery_status();END IF;
   RETURN tbs_retry_delivery(payload->'body',actor);
  END IF;
  IF cohort NOT IN ('employee','intern') OR (actor.role='hr' AND cohort<>'intern') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','You cannot access this history');END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.id::bigint DESC),'[]'::jsonb) INTO result FROM (
   SELECT h.id::text,h.changed_at AS "changedAt",h.entity,h.record_id AS "recordId",h.user_id AS "userId",concat_ws(' ',e.first_name,e.last_name) AS "employeeName",e.department,h.action,h.actor,
   h.before_value-'decision_token' AS "before",h.after_value-'decision_token' AS "after",
   (h.action='cancel' AND h.after_value=to_jsonb(r) AND e.status='active' AND NOT EXISTS(SELECT 1 FROM tbs_change_history newer WHERE newer.entity=h.entity AND newer.record_id=h.record_id AND newer.id>h.id)) AS "canRestore"
   FROM tbs_change_history h JOIN tbs_employees e ON e.user_id=h.user_id LEFT JOIN leave_requests r ON h.entity='leave_requests' AND r.id::text=h.record_id
   WHERE e.employment_type=cohort AND (payload->>'userId' IS NULL OR h.user_id=payload->>'userId') AND (payload->>'cursor' IS NULL OR h.id<(payload->>'cursor')::bigint) ORDER BY h.id DESC LIMIT 50
  ) x;RETURN jsonb_build_object('ok',true,'events',result);
 END IF;
 PERFORM set_config('app.tbs_actor_label',CASE WHEN actor.id IS NULL THEN '' ELSE CASE WHEN actor.username='admin' THEN 'Dale (admin)' ELSE actor.username END||' · Dashboard' END,true);
 result:=tbs_dashboard_auth_before_audit(payload);
 PERFORM set_config('app.tbs_actor_label',previous,true);RETURN result;
END $$;

CREATE OR REPLACE FUNCTION tbs_verified_rejection(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text;
BEGIN
 IF COALESCE(payload->>'accountId','')='' THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in through LINE'); END IF;
 SELECT user_id INTO uid FROM leave_requests WHERE id=(payload->>'id')::int;
 RETURN tbs_line_decision('reject',payload||jsonb_build_object('userId',uid,'expectedRevision',payload->>'revision','decisionToken',payload->>'token','rejectionReason',payload->>'reason'));
END $$;

-- Cancellation decisions are written explicitly rather than by the leave trigger.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('tbs_cancellation(text,jsonb)'::regprocedure) INTO definition;
 IF strpos(definition,'app.tbs_actor_label')=0 THEN definition:=replace(definition,'''Dashboard — user not identified''','COALESCE(NULLIF(current_setting(''app.tbs_actor_label'',true),''''),''Dashboard — user not identified'')'); END IF;
 EXECUTE definition;
 SELECT pg_get_functiondef('tbs_line_cancellation(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'actor=''CEO via verified LINE''','actor=COALESCE((SELECT COALESCE(NULLIF(e.nickname,''''),NULLIF(concat_ws('' '',e.first_name,e.last_name),''''))||'' · LINE'' FROM tbs_employees e WHERE e.user_id=tbs_resolve_employee(payload->>''accountId'')),''LINE — user not identified'')');
 EXECUTE definition;
END $$;
COMMIT;
