BEGIN;
CREATE TABLE IF NOT EXISTS tbs_line_quota(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 monthly_limit integer CHECK(monthly_limit IS NULL OR monthly_limit>=0),
 limit_type text CHECK(limit_type IS NULL OR limit_type IN ('limited','none')),
 api_used integer,
 checked_at timestamptz,
 check_error text,
 check_failed_at timestamptz,
 full_month date,
 alert_email text CHECK(alert_email IS NULL OR (length(alert_email)<=200 AND alert_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
 warn_pct integer NOT NULL DEFAULT 80 CHECK(warn_pct BETWEEN 50 AND 95),
 reserve_pct integer NOT NULL DEFAULT 5 CHECK(reserve_pct BETWEEN 1 AND 30),
 warned_month date,
 warned_level integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
INSERT INTO tbs_line_quota DEFAULT VALUES ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_line_sends(
 id bigserial PRIMARY KEY,
 job_id uuid,
 recipients integer NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tbs_line_sends_sent_at ON tbs_line_sends(sent_at);
CREATE TABLE IF NOT EXISTS tbs_line_held(
 id serial PRIMARY KEY,
 job_id uuid NOT NULL UNIQUE,
 user_id text NOT NULL,
 payload jsonb NOT NULL,
 priority text NOT NULL CHECK(priority IN ('high','low')),
 cost integer NOT NULL,
 delivery_order bigint NOT NULL,
 held_at timestamptz NOT NULL DEFAULT now(),
 released_at timestamptz,
 released_job uuid
);
CREATE INDEX IF NOT EXISTS tbs_line_held_open ON tbs_line_held(delivery_order) WHERE released_at IS NULL;

CREATE OR REPLACE FUNCTION tbs_line_month(ts timestamptz) RETURNS date LANGUAGE sql STABLE AS $$
 SELECT date_trunc('month',ts AT TIME ZONE 'Asia/Tokyo')::date;
$$;
CREATE OR REPLACE FUNCTION tbs_line_priority(payload jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN tbs_approval_request_id(payload) IS NOT NULL
  OR COALESCE(payload#>>'{messages,0,altText}',payload#>>'{messages,0,text}','') ~ '^(อนุมัติแล้ว / Approved|ไม่อนุมัติ / Leave rejected)' THEN 'high' ELSE 'low' END;
$$;
CREATE OR REPLACE FUNCTION tbs_line_cost(payload jsonb) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
 SELECT greatest(COALESCE(cardinality(array_remove(tbs_line_recipients(payload),NULL)),0),1);
$$;

CREATE OR REPLACE FUNCTION tbs_line_quota_used() RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN q.checked_at IS NOT NULL AND tbs_line_month(q.checked_at)=tbs_line_month(now()) THEN
   COALESCE(q.api_used,0)+COALESCE((SELECT sum(recipients) FROM tbs_line_sends WHERE sent_at>q.checked_at),0)
  ELSE COALESCE((SELECT sum(recipients) FROM tbs_line_sends WHERE tbs_line_month(sent_at)=tbs_line_month(now()) AND sent_at>=now()-interval '32 days'),0) END::integer
 FROM tbs_line_quota q WHERE q.singleton;
$$;

CREATE OR REPLACE FUNCTION tbs_line_quota_state() RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE q tbs_line_quota%ROWTYPE; used integer:=tbs_line_quota_used(); m date:=tbs_line_month(now()); lim integer; reserve integer; threshold integer; state text; level integer:=0; BEGIN
 SELECT * INTO q FROM tbs_line_quota WHERE singleton;
 lim:=CASE WHEN q.limit_type='limited' THEN q.monthly_limit END;
 reserve:=CASE WHEN lim IS NOT NULL THEN greatest(ceil(lim*q.reserve_pct/100.0)::integer,1) END;
 threshold:=lim-reserve;
 IF q.full_month=m OR (lim IS NOT NULL AND used>=lim) THEN state:='full'; level:=3;
 ELSIF lim IS NOT NULL AND used>=threshold THEN state:='low'; level:=2;
 ELSIF lim IS NOT NULL AND used*100>=lim*q.warn_pct THEN state:='warn'; level:=1;
 ELSIF q.limit_type='none' THEN state:='unlimited';
 ELSIF lim IS NULL THEN state:='unknown';
 ELSE state:='ok'; END IF;
 RETURN jsonb_build_object('state',state,'level',level,'limit',lim,'limitType',q.limit_type,'used',used,'threshold',threshold,
  'percent',CASE WHEN lim>0 THEN least(round(used*100.0/lim),999) END,
  'checkedAt',q.checked_at,'checkError',CASE WHEN q.check_failed_at>=COALESCE(q.checked_at,'-infinity') THEN q.check_error END,
  'resetsAt',((m+interval '1 month')::timestamp AT TIME ZONE 'Asia/Tokyo'),
  'held',(SELECT count(*) FROM tbs_line_held WHERE released_at IS NULL),
  'heldMessages',(SELECT COALESCE(sum(cost),0) FROM tbs_line_held WHERE released_at IS NULL),
  'alertEmail',q.alert_email,'warnPct',q.warn_pct,'reservePct',q.reserve_pct);
END $$;

CREATE OR REPLACE FUNCTION tbs_line_quota_hold(j tbs_sync_jobs) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO tbs_line_held(job_id,user_id,payload,priority,cost,delivery_order)
  VALUES(j.id,j.user_id,j.payload,tbs_line_priority(j.payload),tbs_line_cost(j.payload),j.delivery_order) ON CONFLICT(job_id) DO NOTHING;
 UPDATE tbs_sync_jobs SET completed_generation=generation,retired_at=now(),retirement_reason='Held until the LINE monthly limit resets',
  lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
END $$;
CREATE OR REPLACE FUNCTION tbs_line_quota_release(h tbs_line_held) RETURNS void LANGUAGE plpgsql AS $$
DECLARE nid uuid; BEGIN
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',h.user_id,h.payload) RETURNING id INTO nid;
 UPDATE tbs_line_held SET released_at=now(),released_job=nid WHERE id=h.id;
END $$;

CREATE OR REPLACE FUNCTION tbs_line_quota_warn(st jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE q tbs_line_quota%ROWTYPE; m date:=tbs_line_month(now()); lvl integer:=(st->>'level')::integer; head text; body text; BEGIN
 SELECT * INTO q FROM tbs_line_quota WHERE singleton FOR UPDATE;
 IF lvl=0 OR q.alert_email IS NULL OR (q.warned_month=m AND q.warned_level>=lvl) THEN RETURN; END IF;
 UPDATE tbs_line_quota SET warned_month=m,warned_level=lvl WHERE singleton;
 head:=CASE lvl WHEN 3 THEN 'LINE เต็มแล้ว / LINE messages are used up'
  WHEN 2 THEN 'LINE ใกล้เต็ม / LINE messages almost used up' ELSE 'LINE ใช้ไป '||(st->>'percent')||'% / LINE messages '||(st->>'percent')||'% used' END;
 body:=CASE lvl WHEN 3 THEN 'Leave requests now go to approvers by email. Other LINE messages wait and go out after the reset.<br>คำขอลาจะส่งทางอีเมลแทน ข้อความอื่นจะรอส่งหลังรีเซ็ต'
  WHEN 2 THEN 'SOP and travel claim messages now wait until the reset, so leave requests and decisions can still go out.<br>ข้อความ SOP และค่าเดินทางจะรอส่งหลังรีเซ็ต เพื่อเก็บโควตาไว้ให้เรื่องการลา'
  ELSE 'Nothing is held yet. Consider a bigger LINE plan before the limit is reached.<br>ยังไม่มีข้อความถูกพักไว้ ลองพิจารณาเพิ่มแพ็กเกจ LINE' END;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('email','line-quota',jsonb_build_object('to',q.alert_email,
  'subject',head||' ('||(st->>'used')||' / '||(st->>'limit')||')',
  'html','<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:16px">'
   ||'<h2 style="margin:0 0 8px">'||tbs_html(head)||'</h2>'
   ||'<p style="font-size:28px;font-weight:bold;margin:0">'||(st->>'used')||' / '||(st->>'limit')||'</p>'
   ||'<p style="margin:4px 0 16px;color:#64748b">Resets '||to_char((st->>'resetsAt')::timestamptz AT TIME ZONE 'Asia/Bangkok','DD Mon YYYY HH24:MI')||' (Bangkok)</p>'
   ||'<p style="padding:12px;border-radius:8px;background:#fffbeb;color:#92400e;font-size:14px">'||body||'</p>'
   ||'<p style="color:#64748b;font-size:12px">See Delivery alerts on the TBS HR dashboard.</p></div>'));
END $$;

CREATE OR REPLACE FUNCTION tbs_line_quota_guard() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE st jsonb:=tbs_line_quota_state(); is_full boolean; lim integer; threshold integer; running integer; x record; j tbs_sync_jobs%ROWTYPE; h tbs_line_held%ROWTYPE; email_ok boolean; BEGIN
 is_full:=st->>'state'='full';
 threshold:=(st->>'threshold')::integer;
 IF is_full THEN
  UPDATE tbs_email_fallback_settings SET line_full_until=greatest(COALESCE(line_full_until,now()),now()+interval '2 minutes') WHERE singleton;
  SELECT EXISTS(SELECT 1 FROM tbs_email_fallback_settings s,jsonb_array_elements(s.recipients) r WHERE s.singleton AND r->>'email' ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') INTO email_ok;
  FOR j IN SELECT * FROM tbs_sync_jobs WHERE kind='line' AND completed_generation<generation AND retired_at IS NULL AND NOT blocked
   AND (lease_token IS NULL OR lease_until<now()) AND (first_attempt_at IS NULL OR last_error ILIKE '%monthly limit%')
   AND (tbs_approval_request_id(payload) IS NULL OR NOT email_ok) ORDER BY delivery_order FOR UPDATE SKIP LOCKED LOOP
   PERFORM tbs_line_quota_hold(j);
  END LOOP;
 ELSE
  FOR h IN SELECT * FROM tbs_line_held WHERE released_at IS NULL AND (priority='high' OR threshold IS NULL) ORDER BY delivery_order FOR UPDATE SKIP LOCKED LOOP
   PERFORM tbs_line_quota_release(h);
  END LOOP;
  IF threshold IS NOT NULL THEN
   running:=(st->>'used')::integer+COALESCE((SELECT sum(tbs_line_cost(payload)) FROM tbs_sync_jobs WHERE kind='line' AND completed_generation<generation
    AND retired_at IS NULL AND NOT blocked AND tbs_line_priority(payload)='high'),0);
   FOR x IN SELECT 'held' src,h2.id::text ref,h2.cost,h2.delivery_order ord FROM tbs_line_held h2 WHERE h2.released_at IS NULL AND h2.priority='low'
    UNION ALL SELECT 'job',j2.id::text,tbs_line_cost(j2.payload),j2.delivery_order FROM tbs_sync_jobs j2 WHERE j2.kind='line' AND j2.completed_generation<j2.generation
     AND j2.retired_at IS NULL AND NOT j2.blocked AND tbs_line_priority(j2.payload)='low'
    ORDER BY ord LOOP
    IF running+x.cost<=threshold THEN
     IF x.src='held' THEN
      SELECT * INTO h FROM tbs_line_held WHERE id=x.ref::integer AND released_at IS NULL FOR UPDATE SKIP LOCKED;
      IF FOUND THEN PERFORM tbs_line_quota_release(h); END IF;
     END IF;
     running:=running+x.cost;
    ELSIF x.src='job' THEN
     SELECT * INTO j FROM tbs_sync_jobs WHERE id=x.ref::uuid AND retired_at IS NULL AND completed_generation<generation
      AND (lease_token IS NULL OR lease_until<now()) AND first_attempt_at IS NULL FOR UPDATE SKIP LOCKED;
     IF FOUND THEN PERFORM tbs_line_quota_hold(j); END IF;
    END IF;
   END LOOP;
  END IF;
 END IF;
 PERFORM tbs_line_quota_warn(st);
 RETURN st;
END $$;

CREATE OR REPLACE FUNCTION tbs_line_quota_report(lim jsonb,use jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF lim->>'type' IN ('limited','none') AND (lim->>'type'='none' OR COALESCE(lim->>'value','')~'^[0-9]{1,9}$') AND COALESCE(use->>'totalUsage','')~'^[0-9]{1,9}$' THEN
  UPDATE tbs_line_quota SET limit_type=lim->>'type',monthly_limit=CASE WHEN lim->>'type'='limited' THEN (lim->>'value')::integer END,
   api_used=(use->>'totalUsage')::integer,checked_at=now(),check_error=NULL,
   full_month=CASE WHEN lim->>'type'='none' OR (use->>'totalUsage')::integer<(lim->>'value')::integer THEN NULL ELSE full_month END
  WHERE singleton;
 ELSE
  UPDATE tbs_line_quota SET check_failed_at=now(),check_error=left(COALESCE(lim->>'message',use->>'message','LINE quota check failed'),300) WHERE singleton;
 END IF;
 RETURN tbs_line_quota_state();
END $$;

DO $$ BEGIN
 IF to_regprocedure('tbs_finish_sync_before_line_quota(uuid,uuid,bigint,text)') IS NULL THEN
  ALTER FUNCTION tbs_finish_sync(uuid,uuid,bigint,text) RENAME TO tbs_finish_sync_before_line_quota;
 END IF;
 IF to_regprocedure('tbs_claim_line_batch_before_line_quota(text)') IS NULL THEN
  ALTER FUNCTION tbs_claim_line_batch(text) RENAME TO tbs_claim_line_batch_before_line_quota;
 END IF;
 IF to_regprocedure('tbs_delivery_status_before_line_quota()') IS NULL THEN
  ALTER FUNCTION tbs_delivery_status() RENAME TO tbs_delivery_status_before_line_quota;
 END IF;
 IF to_regprocedure('tbs_dashboard_auth_before_line_quota(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_line_quota;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION tbs_finish_sync(job_id uuid,lease uuid,claimed_generation bigint,error_message text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE j tbs_sync_jobs%ROWTYPE; saved boolean; BEGIN
 SELECT * INTO j FROM tbs_sync_jobs WHERE id=job_id AND lease_token=lease;
 IF FOUND AND j.kind='line' AND error_message ILIKE '%(429)%monthly limit%' THEN
  UPDATE tbs_line_quota SET full_month=tbs_line_month(now()) WHERE singleton;
 END IF;
 saved:=tbs_finish_sync_before_line_quota(job_id,lease,claimed_generation,error_message);
 IF saved AND error_message IS NULL AND j.kind='line' THEN
  INSERT INTO tbs_line_sends(job_id,recipients) VALUES(j.id,tbs_line_cost(j.payload));
 END IF;
 RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION tbs_claim_line_batch(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
BEGIN
 IF channel='line' AND pg_try_advisory_xact_lock(hashtext('tbs_line_quota')) THEN
  BEGIN
   PERFORM tbs_line_quota_guard();
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'LINE quota guard skipped: %',SQLERRM;
  END;
 END IF;
 RETURN QUERY SELECT * FROM tbs_claim_line_batch_before_line_quota(channel);
END $$;

CREATE OR REPLACE FUNCTION tbs_delivery_status() RETURNS jsonb LANGUAGE sql AS $$
 SELECT tbs_delivery_status_before_line_quota()||jsonb_build_object('lineQuota',tbs_line_quota_state());
$$;

CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; b jsonb:=COALESCE(payload->'body','{}'::jsonb); mail text; BEGIN
 IF payload->>'operation' IS DISTINCT FROM 'line-quota-save' THEN RETURN tbs_dashboard_auth_before_line_quota(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF actor.role NOT IN ('admin','ceo') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Admin or CEO access required'); END IF;
 mail:=NULLIF(lower(btrim(COALESCE(b->>'alertEmail',''))),'');
 IF mail IS NOT NULL AND (length(mail)>200 OR mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the email address.'); END IF;
 IF COALESCE(b->>'warnPct','')!~'^[0-9]{1,2}$' OR (b->>'warnPct')::int NOT BETWEEN 50 AND 95 OR COALESCE(b->>'reservePct','')!~'^[0-9]{1,2}$' OR (b->>'reservePct')::int NOT BETWEEN 1 AND 30
  OR (b->>'warnPct')::int>=100-(b->>'reservePct')::int THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the warning levels.');
 END IF;
 UPDATE tbs_line_quota SET alert_email=mail,warn_pct=(b->>'warnPct')::int,reserve_pct=(b->>'reservePct')::int,updated_at=now(),updated_by=actor.username WHERE singleton;
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'line-quota-save',NULL);
 RETURN jsonb_build_object('ok',true,'lineQuota',tbs_line_quota_state());
END $$;
COMMIT;
