BEGIN;
CREATE TABLE IF NOT EXISTS tbs_personal_alerts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES tbs_employees(user_id),year integer NOT NULL,
 token uuid NOT NULL DEFAULT gen_random_uuid(),job_id uuid REFERENCES tbs_sync_jobs(id),acknowledged_at timestamptz,retired_at timestamptz,
 UNIQUE(user_id,year));
CREATE OR REPLACE FUNCTION tbs_personal_used(uid text,as_of date) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT COALESCE(sum(r.leave_days/cardinality(ds.dates)),0) FROM leave_requests r
 CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) dates) ds CROSS JOIN LATERAL unnest(ds.dates) d
 WHERE r.user_id=tbs_resolve_employee(uid) AND lower(r.leave_type)='personal' AND r.status='Approved' AND extract(year FROM d)=extract(year FROM as_of) AND d<=as_of;
$$;
CREATE OR REPLACE FUNCTION tbs_personal_card(uid text,yr integer,alert_id uuid,token uuid,as_of date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE lang text; e tbs_employees%ROWTYPE; used numeric; balance jsonb; card jsonb;
BEGIN
 SELECT * INTO e FROM tbs_employees WHERE user_id=uid; SELECT language INTO lang FROM tbs_sick_language WHERE user_id=uid;
 used:=tbs_personal_used(uid,as_of);balance:=tbs_leave_balance(uid,yr,'personal');
 card:=jsonb_build_object('type','flex','altText','Personal leave usage notice','contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','spacing','md','contents',jsonb_build_array(
 jsonb_build_object('type','text','text',CASE WHEN lang='th' THEN 'แจ้งเตือนการใช้วันลากิจ' ELSE 'PERSONAL LEAVE NOTICE' END,'weight','bold','color','#B91C1C','wrap',true),
 jsonb_build_object('type','text','text',concat_ws(' ',e.first_name,e.last_name),'weight','bold','wrap',true),
 jsonb_build_object('type','text','text',CASE WHEN lang='th' THEN 'ใช้ลากิจแล้ว '||used::float8||' จาก 3 วัน ในปี '||yr ELSE 'You have used '||used::float8||' of 3 personal leave days in '||yr||'.' END,'wrap',true),
 jsonb_build_object('type','text','text',CASE WHEN lang='th' THEN 'ยอดคงเหลือที่ขอได้: '||(balance->>'available')||' วัน · รออนุมัติ: '||(balance->>'pending')||' วัน' ELSE 'Available to request: '||(balance->>'available')||' day(s). Pending: '||(balance->>'pending')||' day(s).' END,'wrap',true),
 jsonb_build_object('type','text','text',CASE WHEN lang='th' THEN 'ยอดคงเหลือหักวันลาที่อนุมัติล่วงหน้าและคำขอรออนุมัติแล้ว' ELSE 'Availability includes future approved leave and pending reservations.' END,'wrap',true,'size','xs','color','#64748B')))));
 RETURN tbs_sick_ack_card(card,alert_id,token,COALESCE(lang='th',false));
END $$;
CREATE OR REPLACE FUNCTION tbs_run_personal_daily(run_at timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE local_now timestamp:=run_at AT TIME ZONE 'Asia/Bangkok'; e record; a tbs_personal_alerts%ROWTYPE; job uuid; n integer:=0; recipient text;
BEGIN
 PERFORM 1 FROM tbs_leave_policy_settings WHERE singleton FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM tbs_leave_policy_settings WHERE personal_notifications_enabled AND (last_personal_date IS NULL OR last_personal_date<local_now::date)) OR local_now::time<time '08:30' THEN RETURN 0; END IF;
 FOR e IN SELECT user_id FROM tbs_employees WHERE employment_type='employee' AND COALESCE(status,'active')='active' AND NOT tbs_leave_unlimited(user_id) ORDER BY user_id LOOP
  IF tbs_personal_used(e.user_id,local_now::date)<2 THEN CONTINUE; END IF;
  INSERT INTO tbs_personal_alerts(user_id,year) VALUES(e.user_id,extract(year FROM local_now)::int) ON CONFLICT DO NOTHING;
  SELECT * INTO a FROM tbs_personal_alerts WHERE user_id=e.user_id AND year=extract(year FROM local_now) FOR UPDATE;
  IF a.acknowledged_at IS NOT NULL THEN CONTINUE; END IF;
  -- Delivered notices never repeat, even after correction/reapproval. Unsent retired notices may be requeued.
  IF a.job_id IS NOT NULL AND (a.retired_at IS NULL OR EXISTS(SELECT 1 FROM tbs_sync_jobs WHERE id=a.job_id AND first_attempt_at IS NOT NULL)) THEN CONTINUE; END IF;
  recipient:=e.user_id;
  SELECT COALESCE((SELECT account_user_id FROM tbs_request_accounts ra JOIN leave_requests r ON r.id=ra.request_id WHERE r.user_id=e.user_id ORDER BY r.id DESC LIMIT 1),e.user_id) INTO recipient;
  INSERT INTO tbs_sync_jobs(kind,user_id,year,payload) VALUES('line',e.user_id,a.year,jsonb_build_object('to',recipient,'messages',jsonb_build_array(tbs_personal_card(e.user_id,a.year,a.id,a.token,local_now::date)))) RETURNING id INTO job;
  UPDATE tbs_personal_alerts SET job_id=job,retired_at=NULL WHERE id=a.id;n:=n+1;
 END LOOP;
 UPDATE tbs_leave_policy_settings SET last_personal_date=local_now::date WHERE singleton;RETURN n;
END $$;
DO $$ BEGIN
 IF to_regprocedure('tbs_run_sick_daily_before_personal(timestamp with time zone)') IS NULL THEN ALTER FUNCTION tbs_run_sick_daily(timestamptz) RENAME TO tbs_run_sick_daily_before_personal; END IF;
 IF to_regprocedure('tbs_refresh_sick_jobs_before_personal()') IS NULL THEN ALTER FUNCTION tbs_refresh_sick_jobs() RENAME TO tbs_refresh_sick_jobs_before_personal; END IF;
 IF to_regprocedure('tbs_sick_job_allowed_before_personal(uuid)') IS NULL THEN ALTER FUNCTION tbs_sick_job_allowed(uuid) RENAME TO tbs_sick_job_allowed_before_personal; END IF;
 IF to_regprocedure('tbs_sick_acknowledge_before_personal(text,jsonb)') IS NULL THEN ALTER FUNCTION tbs_sick_acknowledge(text,jsonb) RENAME TO tbs_sick_acknowledge_before_personal; END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_run_sick_daily(run_at timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN RETURN tbs_run_sick_daily_before_personal(run_at)+tbs_run_personal_daily(run_at); END $$;
CREATE OR REPLACE FUNCTION tbs_refresh_sick_jobs() RETURNS void LANGUAGE plpgsql AS $$
DECLARE a tbs_personal_alerts%ROWTYPE; today date:=(now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 PERFORM tbs_refresh_sick_jobs_before_personal();
 -- Original sick refresh may unretire exempt employees; explicitly suppress their pending deliveries.
 UPDATE tbs_sick_alerts SET retired_at=COALESCE(retired_at,now()) WHERE tbs_leave_unlimited(user_id) OR EXISTS(SELECT 1 FROM tbs_employees e WHERE e.user_id=tbs_sick_alerts.user_id AND e.employment_type='intern');
 FOR a IN SELECT p.* FROM tbs_personal_alerts p JOIN tbs_sync_jobs j ON j.id=p.job_id WHERE j.completed_generation<j.generation AND (j.lease_until IS NULL OR j.lease_until<now()) FOR UPDATE OF p LOOP
  IF a.acknowledged_at IS NOT NULL OR tbs_leave_unlimited(a.user_id) OR a.year<>extract(year FROM today)
   OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=a.user_id AND employment_type='employee' AND COALESCE(status,'active')='active') OR tbs_personal_used(a.user_id,today)<2 THEN
   UPDATE tbs_sync_jobs SET completed_generation=generation,blocked=false WHERE id=a.job_id;
   UPDATE tbs_personal_alerts SET retired_at=now() WHERE id=a.id;
  ELSE UPDATE tbs_sync_jobs SET payload=jsonb_set(payload,'{messages}',jsonb_build_array(tbs_personal_card(a.user_id,a.year,a.id,a.token,today))) WHERE id=a.job_id AND first_attempt_at IS NULL; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION tbs_sick_job_allowed(job_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT tbs_sick_job_allowed_before_personal($1)
 AND NOT EXISTS(SELECT 1 FROM tbs_sick_alert_jobs m JOIN tbs_sick_alerts a ON a.id=m.alert_id WHERE m.job_id=$1 AND (tbs_leave_unlimited(a.user_id) OR EXISTS(SELECT 1 FROM tbs_employees e WHERE e.user_id=a.user_id AND e.employment_type='intern')))
 AND (NOT EXISTS(SELECT 1 FROM tbs_personal_alerts WHERE tbs_personal_alerts.job_id=$1)
 OR EXISTS(SELECT 1 FROM tbs_personal_alerts a WHERE a.job_id=$1 AND a.acknowledged_at IS NULL AND a.retired_at IS NULL AND NOT tbs_leave_unlimited(a.user_id)
 AND EXISTS(SELECT 1 FROM tbs_leave_policy_settings WHERE personal_notifications_enabled)));
$$;
CREATE OR REPLACE FUNCTION tbs_sick_acknowledge(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a tbs_personal_alerts%ROWTYPE; e tbs_employees%ROWTYPE; today date:=(now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 SELECT * INTO a FROM tbs_personal_alerts WHERE id::text=payload->>'id' FOR UPDATE;
 IF NOT FOUND THEN RETURN tbs_sick_acknowledge_before_personal(operation,payload); END IF;
 IF a.token::text IS DISTINCT FROM payload->>'token' OR a.retired_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This notice is no longer current.'); END IF;
 IF tbs_resolve_employee(payload->>'accountId') IS DISTINCT FROM a.user_id THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','This notice belongs to a different LINE account.'); END IF;
 IF operation='sick-acknowledge' THEN UPDATE tbs_personal_alerts SET acknowledged_at=COALESCE(acknowledged_at,now()) WHERE id=a.id; RETURN jsonb_build_object('ok',true,'acknowledged',true); END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=a.user_id;
 RETURN jsonb_build_object('ok',true,'leaveType','personal','acknowledged',a.acknowledged_at IS NOT NULL,'name',concat_ws(' ',e.first_name,e.last_name),
 'total',tbs_personal_used(a.user_id,least(today,make_date(a.year,12,31))),'threshold',2,'year',a.year,'audience','employee');
END $$;
COMMIT;
