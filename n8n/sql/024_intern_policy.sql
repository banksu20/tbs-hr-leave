-- Install after 021, 022 and 023. No notifications are activated by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS tbs_intern_terms (
 user_id text PRIMARY KEY REFERENCES tbs_employees(user_id), start_date date NOT NULL, end_date date NOT NULL,
 months integer NOT NULL CHECK(months IN (4,6)), CHECK(end_date>=start_date)
);
CREATE TABLE IF NOT EXISTS tbs_policy_routing(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),hr_line_id text NOT NULL);
INSERT INTO tbs_policy_routing VALUES(true,'U437d78a035fce09cd623650fb6c3fc97') ON CONFLICT DO NOTHING;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS emergency_reason text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS tbs_leave_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES tbs_employees(user_id),
 request_id integer REFERENCES leave_requests(id), filename text NOT NULL, mime text NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg')),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 2097152),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tbs_leave_evidence_request ON tbs_leave_evidence(request_id);
CREATE OR REPLACE FUNCTION tbs_policy_deadline(uid text,kind text,d date) RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE prior date; BEGIN
 IF d IS NULL THEN RETURN NULL; END IF;
 IF kind='sick' THEN RETURN (d+time '08:30') AT TIME ZONE 'Asia/Bangkok'; END IF;
 IF kind='personal' THEN prior:=d-1; WHILE NOT tbs_working_day(prior) LOOP prior:=prior-1; END LOOP;
 ELSIF kind IN ('annual','vacation') THEN prior:=d-CASE WHEN EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=tbs_resolve_employee(uid) AND employment_type='intern') THEN 3 ELSE 1 END;
 ELSE RETURN NULL; END IF;
 RETURN (prior+time '16:30') AT TIME ZONE 'Asia/Bangkok';
END $$;
DO $$ BEGIN
 IF to_regprocedure('tbs_leave_balance_fulltime(text,integer,text,date[],numeric,integer)') IS NULL THEN ALTER FUNCTION tbs_leave_balance(text,integer,text,date[],numeric,integer) RENAME TO tbs_leave_balance_fulltime; END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_leave_balance(uid text,yr integer,kind text,candidate date[] DEFAULT '{}',per_day numeric DEFAULT 0,excluded_id integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE terms tbs_intern_terms%ROWTYPE; allowance numeric; approved numeric; pending numeric; requested numeric; valid boolean;
BEGIN
 uid:=tbs_resolve_employee(uid);
 IF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern') THEN RETURN tbs_leave_balance_fulltime(uid,yr,kind,candidate,per_day,excluded_id); END IF;
 SELECT * INTO terms FROM tbs_intern_terms WHERE user_id=uid;
 allowance:=CASE WHEN kind='personal' THEN 3 WHEN kind IN ('sick','annual') THEN CASE terms.months WHEN 4 THEN 2 WHEN 6 THEN 3 END END;
 SELECT COALESCE(sum(r.leave_days/cardinality(ds.dates)) FILTER(WHERE r.status='Approved'),0),COALESCE(sum(r.leave_days/cardinality(ds.dates)) FILTER(WHERE r.status='Pending'),0) INTO approved,pending
 FROM leave_requests r CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) dates) ds CROSS JOIN LATERAL unnest(ds.dates) d
 WHERE r.user_id=uid AND r.id IS DISTINCT FROM excluded_id AND (lower(r.leave_type)=kind OR kind='annual' AND lower(r.leave_type)='vacation') AND d BETWEEN terms.start_date AND terms.end_date;
 requested:=COALESCE(cardinality(candidate),0)*per_day;
 valid:=terms.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM unnest(candidate) d WHERE d<terms.start_date OR d>terms.end_date);
 RETURN jsonb_build_object('year',yr,'type',kind,'period','internship','unlimited',kind='university','known',terms.user_id IS NOT NULL,'total',allowance,'approved',approved,'pending',pending,'requested',requested,'available',GREATEST(0,allowance-approved-pending),'allowed',valid AND (kind='university' OR approved+pending+requested<=allowance));
END $$;
-- Reuse the existing quota lock/revision rules, with internship totals for interns.
CREATE OR REPLACE FUNCTION tbs_intern_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance jsonb; dates date[]; kind text; BEGIN
 IF NEW.status='Rejected' OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type='intern') THEN RETURN NEW; END IF;
 PERFORM 1 FROM tbs_employees WHERE user_id=NEW.user_id FOR UPDATE;
 IF TG_OP='UPDATE' AND NEW.user_id=OLD.user_id AND NEW.leave_type=OLD.leave_type AND NEW.status=OLD.status AND NEW.leave_days<=OLD.leave_days
 AND NEW.leave_days/cardinality(tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date))<=OLD.leave_days/cardinality(tbs_request_dates(OLD.selected_dates,OLD.start_date::date,OLD.end_date::date))
 AND tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date)<@tbs_request_dates(OLD.selected_dates,OLD.start_date::date,OLD.end_date::date) THEN RETURN NEW; END IF;
 dates:=tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date);kind:=CASE WHEN NEW.leave_type='vacation' THEN 'annual' ELSE NEW.leave_type END;
 balance:=tbs_leave_balance(NEW.user_id,extract(year FROM dates[1])::int,kind,dates,NEW.leave_days/cardinality(dates),NEW.id);
 IF NOT COALESCE((balance->>'allowed')::boolean,false) THEN RAISE EXCEPTION 'Internship dates or leave allowance do not cover this request. Contact HR.' USING ERRCODE='P2001'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_intern_request_guard ON leave_requests;
CREATE TRIGGER tbs_intern_request_guard BEFORE INSERT OR UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_intern_request_guard();
-- Remove the earlier blanket intern block now that the dedicated intern guard exists.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_enforce_leave_policy()'::regprocedure) INTO def;
 def:=replace(def,'IF TG_OP=''INSERT'' AND EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type=''intern'') THEN RAISE EXCEPTION ''Intern leave policy is not configured. Contact HR.'' USING ERRCODE=''P2001''; END IF;','');EXECUTE def;
 SELECT pg_get_functiondef('tbs_employee_request_before_policy(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'kind NOT IN (''annual'',''sick'',''personal'')','kind NOT IN (''annual'',''sick'',''personal'',''university'')');
 EXECUTE def;
END $$;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_employee_request(jsonb)'::regprocedure) INTO def;
 def:=regexp_replace(def,' IF lower\(payload->>''leaveType''\) IN \(''annual'',''vacation'',''personal''\) AND now\(\)>=tbs_leave_deadline\(first_day\) THEN.*?END IF;','','n');
 IF to_regprocedure('tbs_employee_request_before_intern(jsonb)') IS NULL THEN
  EXECUTE def; ALTER FUNCTION tbs_employee_request(jsonb) RENAME TO tbs_employee_request_before_intern;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_employee_request(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'userId'); dates date[]; kind text; is_intern boolean; result jsonb; evidence uuid[]; recipients jsonb; emergency text:=btrim(COALESCE(payload->>'emergencyReason','')); previous text;
BEGIN
 PERFORM 1 FROM tbs_employees WHERE user_id=uid FOR UPDATE;
 SELECT employment_type='intern' INTO is_intern FROM tbs_employees WHERE user_id=uid;
 kind:=CASE WHEN payload->>'leaveType'='vacation' THEN 'annual' ELSE payload->>'leaveType' END;
 SELECT array_agg(value::date ORDER BY value::date) INTO dates FROM jsonb_array_elements_text(payload->'selectedDates');
 IF cardinality(dates) IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select leave dates.'); END IF;
 IF length(emergency)>2000 OR (emergency<>'' AND kind NOT IN ('sick','personal')) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Emergency exceptions apply only to sick and personal leave.'); END IF;
 IF now()>=tbs_policy_deadline(uid,kind,dates[1]) AND emergency='' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','The request deadline has passed. Sick or personal emergencies need an explanation.'); END IF;
 IF kind='university' AND NOT is_intern THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','University activities are available to interns only.'); END IF;
 SELECT COALESCE(array_agg(value::uuid),'{}') INTO evidence FROM jsonb_array_elements_text(COALESCE(payload->'evidenceIds','[]'));
 IF cardinality(evidence)>3 OR cardinality(evidence)<>(SELECT count(DISTINCT id) FROM unnest(evidence) id) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Attach up to three different files.'); END IF;
 PERFORM 1 FROM tbs_leave_evidence WHERE id=ANY(evidence) FOR UPDATE;
 IF (SELECT count(*) FROM tbs_leave_evidence WHERE id=ANY(evidence) AND user_id=uid AND request_id IS NULL)<>cardinality(evidence) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Evidence does not belong to this request.'); END IF;
 IF kind='university' AND cardinality(evidence)=0 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Attach supporting evidence for university activities.'); END IF;
 IF is_intern THEN SELECT jsonb_build_array(hr_line_id) INTO recipients FROM tbs_policy_routing WHERE singleton;
 ELSE SELECT jsonb_agg(id) INTO recipients FROM unnest(ARRAY['U715bf0a842fd10bebdeb446c45c3ba38','U437d78a035fce09cd623650fb6c3fc97']) id WHERE id<>uid; END IF;
 previous:=COALESCE(current_setting('app.tbs_emergency',true),'');PERFORM set_config('app.tbs_emergency',emergency,true);
 result:=tbs_employee_request_before_intern(payload||jsonb_build_object('approverIds',recipients));
 PERFORM set_config('app.tbs_emergency',previous,true);
 IF COALESCE((result->>'ok')::boolean,false) THEN UPDATE tbs_leave_evidence SET request_id=(result->>'id')::integer WHERE id=ANY(evidence); END IF;
 RETURN result;
EXCEPTION WHEN SQLSTATE 'P2001' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error',SQLERRM);
 WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request data.');
END $$;
CREATE OR REPLACE FUNCTION tbs_request_emergency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.emergency_reason:=COALESCE(current_setting('app.tbs_emergency',true),'');
 IF NEW.emergency_reason<>'' THEN NEW.reason:=NEW.reason||E'\n\nEmergency: '||NEW.emergency_reason; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tbs_request_emergency ON leave_requests;
CREATE TRIGGER tbs_request_emergency BEFORE INSERT ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_request_emergency();
CREATE OR REPLACE FUNCTION tbs_leave_policy_preview(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId'); dates date[]; amount numeric; kind text; balances jsonb; alternatives jsonb; intern boolean;
BEGIN
 SELECT employment_type='intern' INTO intern FROM tbs_employees WHERE user_id=uid AND status='active';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Active employee not found.'); END IF;
 IF intern AND NOT EXISTS(SELECT 1 FROM tbs_intern_terms WHERE user_id=uid) THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','HR must configure your internship dates first.'); END IF;
 SELECT COALESCE(array_agg(value::date ORDER BY value::date),'{}') INTO dates FROM jsonb_array_elements_text(payload->'dates');
 amount:=(payload->>'daysPerDate')::numeric;kind:=CASE WHEN payload->>'type'='vacation' THEN 'annual' ELSE payload->>'type' END;
 IF cardinality(dates)>366 OR cardinality(dates)<>(SELECT count(DISTINCT d) FROM unnest(dates) d) OR amount IS NULL OR amount NOT IN (0.25,0.5,1) OR kind IS NULL OR kind NOT IN ('annual','personal','sick','university') OR (kind='university' AND NOT intern) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request.'); END IF;
 SELECT jsonb_agg(tbs_leave_balance(uid,yr,kind,dates,amount) ORDER BY yr),jsonb_agg(tbs_leave_balance(uid,yr,'annual',dates,amount) ORDER BY yr) INTO balances,alternatives FROM
 (SELECT DISTINCT extract(year FROM d)::integer yr FROM unnest(CASE WHEN cardinality(dates)=0 THEN ARRAY[(now() AT TIME ZONE 'Asia/Bangkok')::date] WHEN intern THEN ARRAY[dates[1]] ELSE dates END) d) years;
 RETURN jsonb_build_object('ok',true,'isIntern',intern,'unlimited',tbs_leave_unlimited(uid),'balances',balances,'annualBalances',alternatives,'deadline',tbs_policy_deadline(uid,kind,dates[1]),'late',COALESCE(now()>=tbs_policy_deadline(uid,kind,dates[1]),false),'medicalCertificateRequired',kind='sick' AND tbs_medical_certificate(uid,dates,amount));
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid dates or duration.'); END $$;
CREATE OR REPLACE FUNCTION tbs_policy_admin(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; uid text:=payload->>'userId'; BEGIN
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF payload->>'action'='list' THEN RETURN jsonb_build_object('ok',true,'terms',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM tbs_intern_terms t),'[]'::jsonb)); END IF;
 PERFORM 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Intern not found'); END IF;
 IF EXISTS(SELECT 1 FROM leave_requests WHERE user_id=uid AND status<>'Rejected') THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Internship terms cannot be changed after leave is recorded. Review the existing records first.'); END IF;
 INSERT INTO tbs_intern_terms VALUES(uid,(payload->>'startDate')::date,(payload->>'endDate')::date,(payload->>'months')::integer)
 ON CONFLICT(user_id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,months=excluded.months;
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'intern-terms',uid);
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION tbs_evidence(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; uid text; item tbs_leave_evidence%ROWTYPE; rid integer:=NULLIF(payload->>'requestId','')::integer; result jsonb; BEGIN
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 uid:=tbs_resolve_employee(payload->>'accountId');
 IF actor.id IS NULL AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND status='active') THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF payload->>'action'='remove' THEN
  DELETE FROM tbs_leave_evidence WHERE id=(payload->>'id')::uuid AND user_id=uid AND request_id IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Only your unattached files can be removed');END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF payload->>'action'='upload' THEN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Employee sign-in required'); END IF;
  PERFORM 1 FROM tbs_employees WHERE user_id=uid FOR UPDATE;
  DELETE FROM tbs_leave_evidence WHERE user_id=uid AND request_id IS NULL AND created_at<now()-interval '1 day';
  IF (SELECT count(*) FROM tbs_leave_evidence WHERE user_id=uid AND request_id IS NULL)>=6 THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Too many unattached files. Try again tomorrow.'); END IF;
  IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM leave_requests WHERE id=rid AND user_id=uid AND leave_type='sick' AND status<>'Rejected') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Request not available'); END IF;
  IF rid IS NOT NULL AND (SELECT count(*) FROM tbs_leave_evidence WHERE request_id=rid)>=3 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Up to three attachments per request'); END IF;
  INSERT INTO tbs_leave_evidence(user_id,request_id,filename,mime,content) VALUES(uid,rid,left(payload->>'filename',150),payload->>'mime',decode(payload->>'content','base64')) RETURNING * INTO item;
  RETURN jsonb_build_object('ok',true,'id',item.id,'filename',item.filename);
 END IF;
 IF payload->>'id' IS NOT NULL THEN SELECT * INTO item FROM tbs_leave_evidence WHERE id=(payload->>'id')::uuid;rid:=item.request_id; END IF;
 IF actor.id IS NOT NULL THEN
  IF rid IS NULL OR NOT EXISTS(SELECT 1 FROM leave_requests r JOIN tbs_employees e ON e.user_id=r.user_id WHERE r.id=rid AND (actor.role IN ('admin','ceo') OR e.employment_type='intern')) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Access denied'); END IF;
 ELSE
  IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM leave_requests WHERE id=rid AND user_id=uid) OR item.id IS NOT NULL AND item.user_id<>uid THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Access denied'); END IF;
 END IF;
 IF payload->>'action'='download' AND item.id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'filename',item.filename,'mime',item.mime,'content',encode(item.content,'base64')); END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'filename',filename,'createdAt',created_at)),'[]'::jsonb) INTO result FROM tbs_leave_evidence WHERE request_id=rid;
 RETURN jsonb_build_object('ok',true,'files',result);
END $$;
COMMIT;
