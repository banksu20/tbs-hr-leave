BEGIN;
CREATE TABLE IF NOT EXISTS tbs_account_aliases(
 account_id text PRIMARY KEY,
 employee_user_id text NOT NULL REFERENCES tbs_employees(user_id),
 CHECK(account_id<>employee_user_id)
);
CREATE TABLE IF NOT EXISTS tbs_self_recorded_leave(user_id text PRIMARY KEY REFERENCES tbs_employees(user_id));
INSERT INTO tbs_self_recorded_leave SELECT user_id FROM tbs_employees WHERE user_id='ceo-dan' AND tbs_id=0 ON CONFLICT DO NOTHING;
INSERT INTO tbs_account_aliases(account_id,employee_user_id)
 SELECT s.ceo_account_id,'ceo-dan' FROM tbs_cancellation_line_settings s
 WHERE s.ceo_account_id ~ '^U[0-9a-f]{32}$' AND EXISTS(SELECT 1 FROM tbs_employees WHERE user_id='ceo-dan' AND tbs_id=0)
 AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=s.ceo_account_id)
 AND NOT EXISTS(SELECT 1 FROM tbs_employee_accounts WHERE account_user_id=s.ceo_account_id)
 LIMIT 1 ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION tbs_resolve_employee(account_id text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT employee_user_id FROM tbs_employee_accounts WHERE account_user_id=account_id),
  (SELECT employee_user_id FROM tbs_account_aliases WHERE tbs_account_aliases.account_id=tbs_resolve_employee.account_id),account_id);
$$;
DO $$
BEGIN
 IF to_regprocedure('tbs_employee_request_before_self_record(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_employee_request(jsonb) RENAME TO tbs_employee_request_before_self_record;
 END IF;
 IF to_regprocedure('tbs_leave_policy_preview_before_self_record(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_leave_policy_preview(jsonb) RENAME TO tbs_leave_policy_preview_before_self_record;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_employee_request(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'userId'); kind text; dates date[]; per numeric; d date; r jsonb; ids integer[]:='{}'; msg text; code text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_self_recorded_leave s JOIN tbs_employees e ON e.user_id=s.user_id WHERE s.user_id=uid AND COALESCE(e.status,'active')='active') THEN
  RETURN tbs_employee_request_before_self_record(payload);
 END IF;
 kind:=CASE WHEN payload->>'leaveType'='vacation' THEN 'annual' ELSE payload->>'leaveType' END;
 IF kind NOT IN ('sick','annual','personal') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose sick, annual or personal leave.'); END IF;
 SELECT array_agg(DISTINCT value::date ORDER BY value::date) INTO dates FROM jsonb_array_elements_text(COALESCE(payload->'selectedDates','[]'));
 IF cardinality(dates) IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select leave dates.'); END IF;
 per:=round(((payload->>'leaveDays')::numeric/cardinality(dates))*4)/4;
 IF per NOT IN (0.5,1) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check your leave dates and duration.'); END IF;
 BEGIN
  FOREACH d IN ARRAY dates LOOP
   r:=tbs_dashboard_request_v2('create',jsonb_build_object('userId',uid,'leaveDate',d,'leaveType',kind,'leaveDays',per,
    'halfDayPeriod',CASE WHEN per=0.5 THEN payload->'halfDayPeriod' ELSE 'null'::jsonb END,'reason',COALESCE(payload->>'reason',''),'status','Approved','source','line-self'));
   IF NOT COALESCE((r->>'ok')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='P2098',MESSAGE=COALESCE(r->>'error','Leave could not be recorded.'),DETAIL=COALESCE(r->>'statusCode','422');
   END IF;
   ids:=ids||(r->>'id')::integer;
  END LOOP;
 EXCEPTION WHEN SQLSTATE 'P2098' THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT, code=PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object('ok',false,'statusCode',CASE WHEN code ~ '^[0-9]{3}$' THEN code::integer ELSE 422 END,'error',msg);
 END;
 RETURN jsonb_build_object('ok',true,'id',ids[1],'ids',to_jsonb(ids),'status','Approved','selfRecorded',true);
END $$;
CREATE OR REPLACE FUNCTION tbs_leave_policy_preview(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:=tbs_leave_policy_preview_before_self_record(payload);
BEGIN
 IF COALESCE((result->>'ok')::boolean,false) AND EXISTS(SELECT 1 FROM tbs_self_recorded_leave WHERE user_id=tbs_resolve_employee(payload->>'accountId')) THEN
  result:=result||jsonb_build_object('deadline',NULL,'late',false,'medicalCertificateRequired',false,'selfRecorded',true);
 END IF;
 RETURN result;
END $$;
DO $$ DECLARE def text; fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['tbs_enforce_leave_policy()','tbs_request_type_guard()'] LOOP
  SELECT pg_get_functiondef(fn::regprocedure) INTO def;
  IF strpos(def,'tbs_self_recorded_leave')=0 THEN
   def:=regexp_replace(def,'COALESCE\(NEW\.reason,''''\)\s*!~\s*''\[\^\[:space:\]\]''',
    'COALESCE(NEW.reason,'''') !~ ''[^[:space:]]'' AND NOT EXISTS(SELECT 1 FROM tbs_self_recorded_leave WHERE user_id=NEW.user_id)');
   IF strpos(def,'tbs_self_recorded_leave')=0 THEN RAISE EXCEPTION 'Reason rule not found in %',fn; END IF;
   EXECUTE def;
  END IF;
 END LOOP;
END $$;
COMMIT;
