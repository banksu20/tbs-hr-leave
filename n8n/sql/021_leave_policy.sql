-- Install after 020. New personal notifications are OFF until explicitly enabled.
-- Existing leave is not rewritten. Validate the holiday calendar before activation.
BEGIN;
ALTER TABLE tbs_employees ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'employee' CHECK(employment_type IN ('employee','intern'));
CREATE TABLE IF NOT EXISTS tbs_leave_exemptions(user_id text PRIMARY KEY REFERENCES tbs_employees(user_id));
INSERT INTO tbs_leave_exemptions SELECT user_id FROM tbs_employees
 WHERE (user_id='ceo-dan' AND tbs_id=0) OR (user_id='Uf87e4b0b19ede92cfba9df3451c7429d' AND tbs_id=1)
 ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION tbs_leave_unlimited(uid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM tbs_leave_exemptions WHERE user_id=tbs_resolve_employee(uid));
$$;
CREATE TABLE IF NOT EXISTS tbs_work_calendar(day date PRIMARY KEY, working boolean NOT NULL, note text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS tbs_leave_policy_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 personal_notifications_enabled boolean NOT NULL DEFAULT false, last_personal_date date,
 certificate_half_days boolean NOT NULL DEFAULT true);
INSERT INTO tbs_leave_policy_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION tbs_working_day(d date) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT working FROM tbs_work_calendar WHERE day=d),extract(isodow FROM d) BETWEEN 1 AND 5);
$$;
CREATE OR REPLACE FUNCTION tbs_leave_deadline(d date) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
 SELECT ((d-1)+time '16:30') AT TIME ZONE 'Asia/Bangkok';
$$;
-- Include the candidate once, excluding its old row for edits/approvals.
-- Carryover can cover dates on/before expiry only, never later annual leave.
CREATE OR REPLACE FUNCTION tbs_leave_balance(uid text, yr integer, kind text, candidate date[] DEFAULT '{}'::date[], per_day numeric DEFAULT 0, excluded_id integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE q leave_quotas%ROWTYPE; approved numeric; pending numeric; early numeric; requested numeric; allowance numeric; carried numeric;
BEGIN
 SELECT * INTO q FROM leave_quotas WHERE user_id=tbs_resolve_employee(uid) AND year=yr;
 WITH daily AS (
 SELECT r.status,d,r.leave_days/cardinality(ds.dates) amount FROM leave_requests r
 CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) dates) ds
 CROSS JOIN LATERAL unnest(ds.dates) d
 WHERE r.user_id=tbs_resolve_employee(uid) AND r.id IS DISTINCT FROM excluded_id AND COALESCE(r.status,'Pending')<>'Rejected'
 AND (lower(r.leave_type)=kind OR (kind='annual' AND lower(r.leave_type)='vacation')) AND extract(year FROM d)=yr
 ) SELECT COALESCE(sum(amount) FILTER(WHERE status='Approved'),0),COALESCE(sum(amount) FILTER(WHERE status IS DISTINCT FROM 'Approved'),0),
 COALESCE(sum(amount) FILTER(WHERE q.carryover_expires_on IS NULL OR d<=q.carryover_expires_on),0) INTO approved,pending,early FROM daily;
 SELECT count(*)*per_day INTO requested FROM unnest(candidate) d WHERE extract(year FROM d)=yr;
 SELECT early+count(*)*per_day INTO early FROM unnest(candidate) d WHERE extract(year FROM d)=yr AND (q.carryover_expires_on IS NULL OR d<=q.carryover_expires_on);
 allowance:=CASE WHEN kind='personal' THEN CASE WHEN yr>=2026 THEN 3 ELSE q.personal_total END WHEN kind='annual' THEN q.annual_total ELSE 30 END;
 carried:=CASE WHEN kind='annual' THEN LEAST(COALESCE(q.carried_over,0),early) ELSE 0 END;
 RETURN jsonb_build_object('year',yr,'type',kind,'unlimited',tbs_leave_unlimited(uid),'known',q.user_id IS NOT NULL AND allowance IS NOT NULL,
 'total',allowance::float8,'carriedOver',COALESCE(q.carried_over,0)::float8,'approved',approved::float8,'pending',pending::float8,'requested',requested::float8,
 'available',GREATEST(0,allowance+carried-approved-pending)::float8,
 'allowed',tbs_leave_unlimited(uid) OR (q.user_id IS NOT NULL AND allowance IS NOT NULL AND approved+pending+requested<=allowance+carried));
END $$;
CREATE OR REPLACE FUNCTION tbs_medical_certificate(uid text,candidate date[],per_day numeric DEFAULT 1) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE required boolean;
BEGIN
 IF cardinality(candidate)=0 OR candidate IS NULL THEN RETURN false; END IF;
 WITH sick AS (
 SELECT d,sum(amount) amount FROM (
 SELECT d,r.leave_days/cardinality(ds.dates) amount FROM leave_requests r
 CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) dates) ds CROSS JOIN LATERAL unnest(ds.dates) d
 WHERE r.user_id=tbs_resolve_employee(uid) AND lower(r.leave_type)='sick' AND COALESCE(r.status,'Pending')<>'Rejected'
 UNION ALL SELECT d,per_day FROM unnest(candidate) d) s GROUP BY d
 ), calendar AS (
 SELECT d::date d,row_number() OVER(ORDER BY d) seq FROM generate_series(
 LEAST((SELECT min(d) FROM sick),(SELECT min(d) FROM unnest(candidate) d))::timestamp,
 GREATEST((SELECT max(d) FROM sick),(SELECT max(d) FROM unnest(candidate) d))::timestamp,interval '1 day') d WHERE tbs_working_day(d::date)
 ), islands AS (
 SELECT c.d,c.seq-row_number() OVER(ORDER BY c.d) grp FROM calendar c JOIN sick s USING(d)
 WHERE s.amount>=CASE WHEN (SELECT certificate_half_days FROM tbs_leave_policy_settings WHERE singleton) THEN 0.25 ELSE 1 END
 ) SELECT EXISTS(SELECT 1 FROM islands GROUP BY grp HAVING count(*)>=3 AND bool_or(d=ANY(candidate))) INTO required;
 RETURN required;
END $$;
-- All database write paths share the same allowance guard, including LINE decisions.
CREATE OR REPLACE FUNCTION tbs_enforce_leave_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dates date[]; yr integer; kind text; balance jsonb;
BEGIN
 IF NEW.status='Rejected' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.user_id,NEW.status,NEW.leave_type,NEW.leave_days,NEW.selected_dates,NEW.start_date,NEW.end_date)
 IS NOT DISTINCT FROM ROW(OLD.user_id,OLD.status,OLD.leave_type,OLD.leave_days,OLD.selected_dates,OLD.start_date,OLD.end_date) THEN RETURN NEW; END IF;
 PERFORM 1 FROM tbs_employees WHERE user_id=NEW.user_id FOR UPDATE;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type='intern') THEN RAISE EXCEPTION 'Intern leave policy is not configured. Contact HR.' USING ERRCODE='P2001'; END IF;
 IF TG_OP='INSERT' AND COALESCE(NEW.reason,'') !~ '[^[:space:]]' THEN RAISE EXCEPTION 'Please enter a reason for your leave.' USING ERRCODE='P2001'; END IF;
 -- Reducing an existing approved request (partial cancellation) must remain possible even when quotas were lowered.
 IF TG_OP='UPDATE' AND NEW.user_id=OLD.user_id AND NEW.status=OLD.status AND NEW.leave_type=OLD.leave_type
 AND NEW.leave_days<=OLD.leave_days AND tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date)<@tbs_request_dates(OLD.selected_dates,OLD.start_date::date,OLD.end_date::date)
 AND NEW.leave_days/cardinality(tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date))<=OLD.leave_days/cardinality(tbs_request_dates(OLD.selected_dates,OLD.start_date::date,OLD.end_date::date)) THEN RETURN NEW; END IF;
 kind:=CASE WHEN lower(NEW.leave_type)='vacation' THEN 'annual' ELSE lower(NEW.leave_type) END;
 IF EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type='intern') THEN RETURN NEW; END IF;
 IF kind NOT IN ('annual','personal') OR tbs_leave_unlimited(NEW.user_id) THEN RETURN NEW; END IF;
 dates:=tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date);
 FOR yr IN SELECT DISTINCT extract(year FROM d)::int FROM unnest(dates) d LOOP
  balance:=tbs_leave_balance(NEW.user_id,yr,kind,dates,NEW.leave_days/cardinality(dates),NEW.id);
  IF NOT (balance->>'allowed')::boolean THEN
   RAISE EXCEPTION '%',CASE WHEN NOT (balance->>'known')::boolean THEN 'Leave allowance is not configured for '||yr||'. Contact HR.' ELSE 'Insufficient '||kind||' leave in '||yr||'. Approved and pending requests reserve the allowance. Refresh and review before continuing.' END USING ERRCODE='P2001';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_leave_policy_guard ON leave_requests;
CREATE TRIGGER tbs_leave_policy_guard BEFORE INSERT OR UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_enforce_leave_policy();
-- Preserve original bodies and make this migration safe to reapply.
DO $$ BEGIN
 IF to_regprocedure('tbs_employee_request_before_policy(jsonb)') IS NULL THEN ALTER FUNCTION tbs_employee_request(jsonb) RENAME TO tbs_employee_request_before_policy; END IF;
 IF to_regprocedure('tbs_dashboard_request_v2_before_policy(text,jsonb)') IS NULL THEN ALTER FUNCTION tbs_dashboard_request_v2(text,jsonb) RENAME TO tbs_dashboard_request_v2_before_policy; END IF;
 IF to_regprocedure('tbs_check_sick_employee_before_policy(text,date,boolean)') IS NULL THEN ALTER FUNCTION tbs_check_sick_employee(text,date,boolean) RENAME TO tbs_check_sick_employee_before_policy; END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_employee_request(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE dates date[]; first_day date; result jsonb; medical boolean:=false; lang text; card jsonb;
BEGIN
 IF jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR COALESCE(payload->>'reason','') !~ '[^[:space:]]' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Please enter a reason for your leave.'); END IF;
 IF length(payload->>'reason')>2000 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Keep the reason within 2,000 characters.'); END IF;
 IF jsonb_typeof(payload->'selectedDates') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select leave dates.'); END IF;
 SELECT array_agg(value::date ORDER BY value::date),min(value::date) INTO dates,first_day FROM jsonb_array_elements_text(payload->'selectedDates');
 IF lower(payload->>'leaveType') IN ('annual','vacation','personal') AND now()>=tbs_leave_deadline(first_day) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Annual and personal leave must be requested before 16:30 Bangkok time on the previous calendar day. Contact your manager for a late request.'); END IF;
 IF dates IS NULL OR cardinality(dates) NOT BETWEEN 1 AND 366 OR cardinality(dates)<>(SELECT count(DISTINCT d) FROM unnest(dates) d) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid or duplicate leave dates.'); END IF;
 PERFORM 1 FROM tbs_employees WHERE user_id=tbs_resolve_employee(payload->>'userId') FOR UPDATE;
 IF lower(payload->>'leaveType')='sick' THEN medical:=tbs_medical_certificate(payload->>'userId',dates,(payload->>'leaveDays')::numeric/NULLIF(cardinality(dates),0)); END IF;
 result:=tbs_employee_request_before_policy(jsonb_set(payload,'{reason}',to_jsonb(btrim(payload->>'reason'))));
 IF (result->>'ok')::boolean AND medical THEN
  SELECT language INTO lang FROM tbs_sick_language WHERE user_id=tbs_resolve_employee(payload->>'userId');
  card:=jsonb_build_object('type','flex','altText','Medical certificate reminder','contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','spacing','md','contents',jsonb_build_array(
   jsonb_build_object('type','text','weight','bold','color','#B91C1C','wrap',true,'text',CASE WHEN lang='th' THEN 'กรุณาส่งใบรับรองแพทย์' ELSE 'Please submit a medical certificate' END),
   jsonb_build_object('type','text','wrap',true,'text',CASE WHEN lang='th' THEN 'คำขอลาป่วยของคุณครอบคลุมวันทำงานติดต่อกันอย่างน้อย 3 วัน กรุณาส่งใบรับรองแพทย์ให้ฝ่ายบุคคล' ELSE 'Your sick leave request covers at least 3 consecutive working days. Please submit a medical certificate to HR.' END)))));
  INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',result->>'user_id',jsonb_build_object('to',COALESCE(payload->>'submittedBy',payload->>'userId'),'messages',jsonb_build_array(card)));
 END IF;
 RETURN result||jsonb_build_object('medicalCertificateRequired',medical);
EXCEPTION WHEN SQLSTATE 'P2001' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error',SQLERRM);
 WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request dates or duration.');
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_request_v2(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN RETURN tbs_dashboard_request_v2_before_policy(operation,payload);
EXCEPTION WHEN SQLSTATE 'P2001' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error',SQLERRM); END $$;
CREATE OR REPLACE FUNCTION tbs_check_sick_employee(uid text, as_of date DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date, baseline_only boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN IF tbs_leave_unlimited(uid) OR EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=tbs_resolve_employee(uid) AND employment_type='intern') THEN RETURN 0; END IF; RETURN tbs_check_sick_employee_before_policy(uid,as_of,baseline_only); END $$;
-- Keep stored current/future personal allowances consistent with the standard policy.
CREATE OR REPLACE FUNCTION tbs_personal_quota_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.year>=2026 AND EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type='employee') AND NOT tbs_leave_unlimited(NEW.user_id) AND NEW.personal_total IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'Personal leave allowance is fixed at 3 days under the current policy.' USING ERRCODE='P2001'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tbs_personal_quota_policy ON leave_quotas;
UPDATE leave_quotas SET personal_total=3 WHERE year>=2026 AND personal_total IS DISTINCT FROM 3 AND NOT tbs_leave_unlimited(user_id);
CREATE TRIGGER tbs_personal_quota_policy BEFORE INSERT OR UPDATE ON leave_quotas FOR EACH ROW EXECUTE FUNCTION tbs_personal_quota_policy();
DO $$ BEGIN
 IF to_regprocedure('tbs_update_quota_before_policy(jsonb)') IS NULL THEN ALTER FUNCTION tbs_update_quota(jsonb) RENAME TO tbs_update_quota_before_policy; END IF;
 IF to_regprocedure('tbs_rollover_before_policy(jsonb)') IS NULL THEN ALTER FUNCTION tbs_rollover(jsonb) RENAME TO tbs_rollover_before_policy; END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_update_quota(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN RETURN tbs_update_quota_before_policy(payload); EXCEPTION WHEN SQLSTATE 'P2001' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error',SQLERRM); END $$;
CREATE OR REPLACE FUNCTION tbs_rollover(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN RETURN tbs_rollover_before_policy(payload); EXCEPTION WHEN SQLSTATE 'P2001' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error',SQLERRM); END $$;
-- Existing queued sick notices for exempt employees must not be delivered.
UPDATE tbs_sick_alerts SET retired_at=COALESCE(retired_at,now()) WHERE tbs_leave_unlimited(user_id);
CREATE OR REPLACE FUNCTION tbs_leave_policy_preview(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId'); dates date[]; amount numeric; kind text; balances jsonb; alternatives jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Active employee not found.'); END IF;
 IF EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern') THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Intern leave policy is not configured. Contact HR.'); END IF;
 IF jsonb_typeof(payload->'dates') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid leave dates.'); END IF;
 SELECT COALESCE(array_agg(value::date ORDER BY value::date),'{}'::date[]) INTO dates FROM jsonb_array_elements_text(payload->'dates');
 amount:=(payload->>'daysPerDate')::numeric;
 kind:=CASE WHEN payload->>'type'='vacation' THEN 'annual' ELSE payload->>'type' END;
 IF cardinality(dates)>366 OR cardinality(dates)<>(SELECT count(DISTINCT d) FROM unnest(dates) d) OR amount IS NULL OR kind IS NULL OR amount NOT IN (0.25,0.5,1) OR kind NOT IN ('annual','personal','sick') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request.'); END IF;
 SELECT jsonb_agg(tbs_leave_balance(uid,yr,kind,dates,amount) ORDER BY yr),jsonb_agg(tbs_leave_balance(uid,yr,'annual',dates,amount) ORDER BY yr) INTO balances,alternatives FROM
 (SELECT DISTINCT extract(year FROM d)::int yr FROM unnest(CASE WHEN cardinality(dates)=0 THEN ARRAY[(now() AT TIME ZONE 'Asia/Bangkok')::date] ELSE dates END) d) years;
 RETURN jsonb_build_object('ok',true,'unlimited',tbs_leave_unlimited(uid),'balances',balances,'annualBalances',alternatives,'deadline',tbs_leave_deadline(dates[1]),
 'late',kind IN ('annual','personal') AND now()>=tbs_leave_deadline(dates[1]),'medicalCertificateRequired',kind='sick' AND tbs_medical_certificate(uid,dates,amount));
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request.'); END $$;
COMMIT;
