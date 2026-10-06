-- Apply after 016/017 through n8n PostgreSQL. Does not activate or send messages.
BEGIN;
CREATE TABLE IF NOT EXISTS tbs_sick_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL REFERENCES tbs_employees(user_id),
 year integer NOT NULL, audience text NOT NULL CHECK(audience IN ('employee','ceo')),
 threshold integer NOT NULL, recipient text, token uuid NOT NULL DEFAULT gen_random_uuid(),
 acknowledged_at timestamptz, retired_at timestamptz, last_sent_date date,
 UNIQUE(user_id,year,audience)
);
CREATE TABLE IF NOT EXISTS tbs_sick_alert_jobs (
 job_id uuid PRIMARY KEY, alert_id uuid NOT NULL REFERENCES tbs_sick_alerts(id),
 token uuid NOT NULL, sent_date date NOT NULL, delivered_at timestamptz,
 UNIQUE(alert_id,token,sent_date)
);
CREATE OR REPLACE FUNCTION tbs_sick_ack_card(card jsonb, alert_id uuid, ack_token uuid, thai boolean)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(card,'{contents,footer}',jsonb_build_object('type','box','layout','vertical','spacing','sm','paddingAll','20px','contents',jsonb_build_array(
 jsonb_build_object('type','text','size','xs','color','#64748B','wrap',true,'text',CASE WHEN thai THEN 'แจ้งเตือนทุกวันเวลา 08:30 จนกว่าจะกดรับทราบ' ELSE 'Daily reminder at 8:30 AM until acknowledged.' END),
 jsonb_build_object('type','button','style','primary','color','#B91C1C','action',jsonb_build_object('type','uri','label',CASE WHEN thai THEN 'รับทราบ' ELSE 'Acknowledge' END,
 'uri','https://liff.line.me/2008617589-89gR1Y3Y/sick-acknowledge?id='||alert_id||'&token='||ack_token))
 )));
$$;
-- Suppress queued copies of closed/superseded alerts. An already in-flight LINE
-- request cannot be recalled; its old token still cannot acknowledge a newer alert.
CREATE OR REPLACE FUNCTION tbs_stop_sick_jobs(alert_id uuid) RETURNS void LANGUAGE sql AS $$
 UPDATE tbs_sync_jobs SET completed_generation=generation,blocked=false,last_error=NULL
 WHERE id IN (SELECT job_id FROM tbs_sick_alert_jobs WHERE tbs_sick_alert_jobs.alert_id=$1)
 AND completed_generation<generation AND (lease_until IS NULL OR lease_until<now());
$$;
ALTER TABLE tbs_sick_alert_jobs ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
-- Bind outstanding CEO alerts to the current recipient; rotating the token revokes old links.
CREATE OR REPLACE FUNCTION tbs_rebind_sick_alert(alert_id uuid) RETURNS tbs_sick_alerts LANGUAGE plpgsql AS $$
DECLARE a tbs_sick_alerts%ROWTYPE; recipient_now text;
BEGIN
 SELECT * INTO a FROM tbs_sick_alerts WHERE id=alert_id FOR UPDATE;
 IF a.audience='ceo' AND a.acknowledged_at IS NULL THEN
  SELECT ceo_account_id INTO recipient_now FROM tbs_cancellation_line_settings WHERE singleton;
  IF a.recipient IS DISTINCT FROM recipient_now THEN
   PERFORM tbs_stop_sick_jobs(a.id);
   UPDATE tbs_sick_alerts SET recipient=recipient_now,token=gen_random_uuid(),last_sent_date=NULL WHERE id=a.id RETURNING * INTO a;
  END IF;
 END IF;
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION tbs_queue_sick_alert(alert_id uuid, as_of date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE a tbs_sick_alerts%ROWTYPE; e tbs_employees%ROWTYPE; used numeric; lang text; card jsonb; job uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE enabled) THEN RETURN 0; END IF;
 SELECT * INTO a FROM tbs_rebind_sick_alert(alert_id);
 IF a.id IS NULL OR a.acknowledged_at IS NOT NULL THEN RETURN 0; END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=a.user_id AND COALESCE(status,'active')='active';
 used:=tbs_sick_used(a.user_id,least(as_of,make_date(a.year,12,31)));
 IF NOT FOUND OR used<a.threshold THEN
  UPDATE tbs_sick_alerts SET retired_at=now() WHERE id=a.id;
  PERFORM tbs_stop_sick_jobs(a.id); RETURN 0;
 END IF;
 IF a.retired_at IS NOT NULL THEN UPDATE tbs_sick_alerts SET retired_at=NULL WHERE id=a.id; END IF;
 IF a.recipient IS NULL OR a.recipient='' THEN
  IF a.audience='ceo' THEN SELECT ceo_account_id INTO a.recipient FROM tbs_cancellation_line_settings WHERE singleton;
  ELSE a.recipient:=a.user_id; END IF;
  IF a.recipient IS NULL OR a.recipient='' THEN RETURN 0; END IF;
  UPDATE tbs_sick_alerts SET recipient=a.recipient WHERE id=a.id;
 END IF;
 IF EXISTS(SELECT 1 FROM tbs_sick_alert_jobs WHERE tbs_sick_alert_jobs.alert_id=a.id AND token=a.token AND (delivered_at AT TIME ZONE 'Asia/Bangkok')::date>=as_of) THEN RETURN 0; END IF;
 IF a.last_sent_date>=as_of OR EXISTS(SELECT 1 FROM tbs_sick_alert_jobs m JOIN tbs_sync_jobs j ON j.id=m.job_id
  WHERE m.alert_id=a.id AND m.token=a.token AND j.completed_generation<j.generation) THEN RETURN 0; END IF;
 SELECT language INTO lang FROM tbs_sick_language WHERE user_id=a.user_id;
 card:=tbs_sick_ack_card(tbs_sick_flex(jsonb_build_object('name',concat_ws(' ',e.first_name,e.last_name),'code',e.tbs_id,'department',e.department),used,a.threshold,a.year,a.audience='ceo',least(as_of,make_date(a.year,12,31)),COALESCE(lang,'en')),a.id,a.token,COALESCE(lang='th',false) AND a.audience='employee');
 INSERT INTO tbs_sync_jobs(kind,user_id,year,payload) VALUES('line',a.user_id,a.year,jsonb_build_object('to',a.recipient,'messages',jsonb_build_array(card))) RETURNING id INTO job;
 INSERT INTO tbs_sick_alert_jobs(job_id,alert_id,token,sent_date) VALUES(job,a.id,a.token,as_of);
 UPDATE tbs_sick_alerts SET last_sent_date=as_of WHERE id=a.id;
 UPDATE tbs_sick_milestones SET job_id=job WHERE user_id=a.user_id AND year=a.year AND audience=a.audience AND threshold=a.threshold;
 RETURN 1;
END $$;
CREATE OR REPLACE FUNCTION tbs_check_sick_employee(uid text, as_of date DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date, baseline_only boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE e tbs_employees%ROWTYPE; used numeric; yr integer:=extract(year FROM as_of); audience_name text; levels integer[]; t integer; added integer; boss text; alert_id uuid; queued integer:=0;
BEGIN
 IF NOT baseline_only AND NOT EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE enabled) THEN RETURN 0; END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=tbs_resolve_employee(uid) AND COALESCE(status,'active')='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 used:=tbs_sick_used(e.user_id,as_of);
 SELECT ceo_account_id INTO boss FROM tbs_cancellation_line_settings WHERE singleton;
 FOREACH audience_name IN ARRAY ARRAY['employee','ceo'] LOOP
  levels:='{}';
  FOREACH t IN ARRAY CASE WHEN audience_name='ceo' THEN ARRAY[10,30] ELSE ARRAY[5,10,20,25,30] END LOOP
   IF used>=t THEN
    INSERT INTO tbs_sick_milestones(user_id,year,threshold,audience,total,baseline) VALUES(e.user_id,yr,t,audience_name,used,baseline_only) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS added=ROW_COUNT;
    IF added>0 THEN levels:=array_append(levels,t); END IF;
   END IF;
  END LOOP;
  IF cardinality(levels)>0 AND NOT baseline_only THEN
   INSERT INTO tbs_sick_alerts(user_id,year,audience,threshold,recipient) VALUES(e.user_id,yr,audience_name,levels[cardinality(levels)],CASE WHEN audience_name='ceo' THEN boss ELSE e.user_id END)
   ON CONFLICT(user_id,year,audience) DO UPDATE SET threshold=EXCLUDED.threshold,recipient=EXCLUDED.recipient,token=gen_random_uuid(),acknowledged_at=NULL,retired_at=NULL,last_sent_date=NULL RETURNING id INTO alert_id;
   PERFORM tbs_stop_sick_jobs(alert_id);
   queued:=queued+tbs_queue_sick_alert(alert_id,as_of);
  END IF;
 END LOOP;
 RETURN queued;
END $$;
CREATE OR REPLACE FUNCTION tbs_run_sick_daily(run_at timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE local_now timestamp:=run_at AT TIME ZONE 'Asia/Bangkok'; result integer; a record;
BEGIN
 PERFORM 1 FROM tbs_sick_notification_settings WHERE singleton FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE enabled AND (last_daily_date IS NULL OR last_daily_date<local_now::date)) OR local_now::time<time '08:30' THEN RETURN 0; END IF;
 result:=tbs_check_sick_daily(local_now::date);
 FOR a IN SELECT id FROM tbs_sick_alerts WHERE acknowledged_at IS NULL ORDER BY id LOOP
  result:=result+tbs_queue_sick_alert(a.id,local_now::date);
 END LOOP;
 UPDATE tbs_sick_notification_settings SET last_daily_date=local_now::date WHERE singleton;
 RETURN result;
END $$;
-- Explicit, short-lived delivery tests. No public creation endpoint, no leave/quota
-- mutation, no milestone entries, and no recurring scheduler reads this table.
CREATE TABLE IF NOT EXISTS tbs_sick_delivery_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token uuid NOT NULL DEFAULT gen_random_uuid(),
 recipient text NOT NULL REFERENCES tbs_employees(user_id),
 threshold integer NOT NULL CHECK(threshold IN (5,10,20,25,30)),
 audience text NOT NULL CHECK(audience IN ('employee','ceo')),
 total numeric NOT NULL CHECK(total>=0), year integer NOT NULL,
 language text NOT NULL DEFAULT 'en' CHECK(language IN ('en','th')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 acknowledged_at timestamptz
);
CREATE OR REPLACE FUNCTION tbs_sick_acknowledge(operation text, payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE test_alert tbs_sick_delivery_tests%ROWTYPE; a tbs_sick_alerts%ROWTYPE; e tbs_employees%ROWTYPE; lang text; today date:=(now() AT TIME ZONE 'Asia/Bangkok')::date; used numeric;
BEGIN
 SELECT * INTO test_alert FROM tbs_sick_delivery_tests WHERE id::text=payload->>'id' FOR UPDATE;
 IF FOUND THEN
  IF test_alert.token::text IS DISTINCT FROM payload->>'token' OR test_alert.expires_at<=now() THEN
   RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This test link has expired.'); END IF;
  -- Exact recipient for both employee and CEO-shaped test cards; never use the real CEO.
  IF test_alert.recipient IS DISTINCT FROM payload->>'accountId' THEN
   RETURN jsonb_build_object('ok',false,'statusCode',403,'error','This reminder belongs to a different LINE account.'); END IF;
  IF operation='sick-acknowledge' THEN
   UPDATE tbs_sick_delivery_tests SET acknowledged_at=COALESCE(acknowledged_at,now()) WHERE id=test_alert.id;
   RETURN jsonb_build_object('ok',true,'acknowledged',true,'isolatedTest',true);
  END IF;
  SELECT * INTO e FROM tbs_employees WHERE user_id=test_alert.recipient;
  RETURN jsonb_build_object('ok',true,'acknowledged',test_alert.acknowledged_at IS NOT NULL,'isolatedTest',true,
   'name',concat_ws(' ',e.first_name,e.last_name),'total',test_alert.total,'threshold',test_alert.threshold,
   'year',test_alert.year,'audience',test_alert.audience,'language',CASE WHEN test_alert.audience='ceo' THEN 'en' ELSE test_alert.language END);
 END IF;
 SELECT * INTO a FROM tbs_sick_alerts WHERE id::text=payload->>'id' FOR UPDATE;
 IF FOUND THEN SELECT * INTO a FROM tbs_rebind_sick_alert(a.id); END IF;
 IF a.id IS NULL OR a.token::text IS DISTINCT FROM payload->>'token' THEN
  RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This reminder is no longer current. Open the latest card in LINE.'); END IF;
 IF payload->>'accountId' IS NULL OR (a.audience='ceo' AND a.recipient IS DISTINCT FROM payload->>'accountId')
 OR (a.audience='employee' AND a.user_id IS DISTINCT FROM tbs_resolve_employee(payload->>'accountId')) THEN
  RETURN jsonb_build_object('ok',false,'statusCode',403,'error','This reminder belongs to a different LINE account.'); END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=a.user_id;
 used:=tbs_sick_used(a.user_id,least(today,make_date(a.year,12,31)));
 IF COALESCE(e.status,'active')<>'active' OR used<a.threshold THEN
  UPDATE tbs_sick_alerts SET retired_at=now() WHERE id=a.id;
  PERFORM tbs_stop_sick_jobs(a.id);
  RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This reminder no longer applies.'); END IF;
 IF operation='sick-acknowledge' THEN
  UPDATE tbs_sick_alerts SET acknowledged_at=COALESCE(acknowledged_at,now()) WHERE id=a.id;
  PERFORM tbs_stop_sick_jobs(a.id);
  RETURN jsonb_build_object('ok',true,'acknowledged',true);
 END IF;
 SELECT language INTO lang FROM tbs_sick_language WHERE user_id=a.user_id;
 RETURN jsonb_build_object('ok',true,'acknowledged',a.acknowledged_at IS NOT NULL,'name',concat_ws(' ',e.first_name,e.last_name),'total',used,'threshold',a.threshold,'year',a.year,'audience',a.audience,'language',CASE WHEN a.audience='ceo' THEN 'en' ELSE COALESCE(lang,'en') END);
END $$;
-- Refresh unsent snapshots before delivery and suppress acknowledged/superseded ones.
-- Preserve a payload after its first attempt: LINE retries must reuse the same body.
CREATE OR REPLACE FUNCTION tbs_refresh_sick_jobs() RETURNS void LANGUAGE plpgsql AS $$
DECLARE a tbs_sick_alerts%ROWTYPE; used numeric; e tbs_employees%ROWTYPE; lang text; today date:=(now() AT TIME ZONE 'Asia/Bangkok')::date; card jsonb;
BEGIN
 FOR a IN SELECT * FROM tbs_sick_alerts ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO a FROM tbs_rebind_sick_alert(a.id);
  SELECT * INTO e FROM tbs_employees WHERE user_id=a.user_id;
  used:=tbs_sick_used(a.user_id,least(today,make_date(a.year,12,31)));
  IF COALESCE(e.status,'active')<>'active' OR used<a.threshold THEN
   UPDATE tbs_sick_alerts SET retired_at=COALESCE(retired_at,now()) WHERE id=a.id; a.retired_at:=now();
  ELSE UPDATE tbs_sick_alerts SET retired_at=NULL WHERE id=a.id; a.retired_at:=NULL; END IF;
  UPDATE tbs_sync_jobs j SET completed_generation=generation,blocked=false,last_error=NULL FROM tbs_sick_alert_jobs m
   WHERE j.id=m.job_id AND m.alert_id=a.id AND (a.acknowledged_at IS NOT NULL OR a.retired_at IS NOT NULL OR m.token<>a.token)
   AND j.completed_generation<j.generation AND (j.lease_until IS NULL OR j.lease_until<now());
  IF a.acknowledged_at IS NOT NULL OR a.retired_at IS NOT NULL THEN CONTINUE; END IF;
  UPDATE tbs_sync_jobs j SET completed_generation=generation,blocked=false,last_error=NULL FROM tbs_sick_alert_jobs m
   WHERE j.id=m.job_id AND m.alert_id=a.id AND m.token=a.token AND j.first_attempt_at IS NULL AND j.completed_generation<j.generation
   AND EXISTS(SELECT 1 FROM tbs_sick_alert_jobs delivered WHERE delivered.alert_id=a.id AND delivered.token=a.token AND (delivered.delivered_at AT TIME ZONE 'Asia/Bangkok')::date=today);
  SELECT language INTO lang FROM tbs_sick_language WHERE user_id=a.user_id;
  card:=tbs_sick_ack_card(tbs_sick_flex(jsonb_build_object('name',concat_ws(' ',e.first_name,e.last_name),'code',e.tbs_id,'department',e.department),used,a.threshold,a.year,a.audience='ceo',least(today,make_date(a.year,12,31)),COALESCE(lang,'en')),a.id,a.token,COALESCE(lang='th',false) AND a.audience='employee');
  UPDATE tbs_sync_jobs j SET payload=jsonb_set(j.payload,'{messages}',jsonb_build_array(card)) FROM tbs_sick_alert_jobs m
   WHERE j.id=m.job_id AND m.alert_id=a.id AND m.token=a.token AND j.completed_generation<j.generation AND j.first_attempt_at IS NULL;
 END LOOP;
END $$;
-- Pending reminders pause without blocking unrelated result messages to the same person.
CREATE OR REPLACE FUNCTION tbs_sick_job_allowed(job_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM tbs_sick_alert_jobs WHERE tbs_sick_alert_jobs.job_id=$1)
 OR EXISTS(SELECT 1 FROM tbs_sick_alert_jobs m JOIN tbs_sick_alerts a ON a.id=m.alert_id
  WHERE m.job_id=$1 AND m.token=a.token AND a.acknowledged_at IS NULL AND a.retired_at IS NULL
  AND EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE enabled));
$$;
CREATE OR REPLACE FUNCTION tbs_claim_line_batch(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
DECLARE job tbs_sync_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('tbs_sync_'||channel));
 IF channel='line' THEN
  PERFORM tbs_refresh_sick_jobs();
  UPDATE tbs_sync_jobs SET blocked=true,last_error='Delivery outcome needs review: retry window expired'
  WHERE kind='line' AND completed_generation<generation AND first_attempt_at<now()-interval '23 hours';
  -- One outstanding delivery per recipient. A failed/blocked predecessor holds later messages for that recipient.
  RETURN QUERY WITH candidates AS (
   SELECT j.id FROM tbs_sync_jobs j WHERE j.kind='line' AND j.completed_generation<j.generation AND NOT j.blocked AND tbs_sick_job_allowed(j.id)
   AND (j.lease_until IS NULL OR j.lease_until<now())
   AND NOT EXISTS(SELECT 1 FROM tbs_sync_jobs prior WHERE prior.kind='line' AND prior.completed_generation<prior.generation
    AND tbs_sick_job_allowed(prior.id) AND prior.delivery_order<j.delivery_order AND tbs_line_recipients(prior.payload)&&tbs_line_recipients(j.payload))
   ORDER BY j.delivery_order FOR UPDATE OF j SKIP LOCKED LIMIT 20
  ) UPDATE tbs_sync_jobs j SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=j.attempts+1,
     first_attempt_at=COALESCE(j.first_attempt_at,now()) FROM candidates c WHERE j.id=c.id RETURNING j.*;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM tbs_sync_jobs WHERE kind=channel AND lease_token IS NOT NULL AND lease_until>now()) THEN RETURN; END IF;
 SELECT * INTO job FROM tbs_sync_jobs WHERE kind=channel AND completed_generation<generation AND NOT blocked
 AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE tbs_sync_jobs SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,
 first_attempt_at=COALESCE(first_attempt_at,now()) WHERE id=job.id RETURNING * INTO job;
 RETURN NEXT job;
END $$;
-- Record actual successful delivery separately from cancelling an unsent queue entry.
CREATE OR REPLACE FUNCTION tbs_finish_sync(job_id uuid, lease uuid, claimed_generation bigint, error_message text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE saved boolean;
BEGIN
 UPDATE tbs_sync_jobs SET completed_generation=CASE WHEN error_message IS NULL THEN greatest(completed_generation,claimed_generation) ELSE completed_generation END,
 lease_until=CASE WHEN error_message IS NULL THEN NULL ELSE now()+interval '5 minutes' END,lease_token=NULL,last_error=left(error_message,1000),updated_at=now()
 WHERE id=job_id AND lease_token=lease;
 saved:=FOUND;
 IF saved AND error_message IS NULL THEN UPDATE tbs_sick_alert_jobs SET delivered_at=COALESCE(delivered_at,now()) WHERE tbs_sick_alert_jobs.job_id=$1; END IF;
 RETURN saved;
END $$;
-- First activation sends only the highest reached employee and CEO milestone.
CREATE OR REPLACE FUNCTION tbs_activate_sick_notifications() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE result integer; e record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_cancellation_line_settings WHERE singleton AND ceo_account_id ~ '^U[0-9a-f]{32}$') THEN RAISE EXCEPTION 'Configure a valid CEO LINE recipient before activation'; END IF;
 LOCK TABLE leave_requests IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM tbs_sick_notification_settings WHERE singleton FOR UPDATE;
 IF EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE activated_at IS NOT NULL) THEN
  UPDATE tbs_sick_notification_settings SET enabled=true WHERE singleton; RETURN 0; END IF;
 UPDATE tbs_sick_notification_settings SET enabled=true,activated_at=now() WHERE singleton;
 result:=tbs_check_sick_daily();
 PERFORM set_config('app.tbs_action','paid_sick_policy_30',true);
 UPDATE leave_quotas q SET sick_total=30 WHERE year>=2026 AND sick_total IS DISTINCT FROM 30 AND NOT EXISTS(SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=q.user_id);
 RETURN result;
END $$;
ALTER TABLE tbs_sick_language ADD COLUMN IF NOT EXISTS changed_at timestamptz NOT NULL DEFAULT '-infinity';
CREATE OR REPLACE FUNCTION tbs_set_sick_language(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId'); changed timestamptz:=COALESCE(to_timestamp((payload->>'changedAt')::numeric/1000),now());
BEGIN
 IF payload->>'language' IS NULL OR payload->>'language' NOT IN ('en','th') OR changed>now()+interval '1 minute' OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid employee or language'); END IF;
 INSERT INTO tbs_sick_language(user_id,language,changed_at) VALUES(uid,payload->>'language',changed)
 ON CONFLICT(user_id) DO UPDATE SET language=EXCLUDED.language,changed_at=EXCLUDED.changed_at WHERE tbs_sick_language.changed_at<=EXCLUDED.changed_at;
 RETURN jsonb_build_object('ok',true);
END $$;
COMMIT;
