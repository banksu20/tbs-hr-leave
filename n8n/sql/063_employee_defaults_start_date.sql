BEGIN;
-- Full-time annual leave is zero until explicitly assigned. Intern quotas remain date-based.
CREATE OR REPLACE FUNCTION tbs_fulltime_annual_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.annual_total IS NULL AND EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type='employee') THEN NEW.annual_total:=0; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_fulltime_annual_default ON leave_quotas;
CREATE TRIGGER tbs_fulltime_annual_default BEFORE INSERT OR UPDATE ON leave_quotas FOR EACH ROW EXECUTE FUNCTION tbs_fulltime_annual_default();
UPDATE leave_quotas q SET annual_total=0 FROM tbs_employees e WHERE q.user_id=e.user_id AND e.employment_type='employee' AND q.annual_total IS NULL;
DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_start_date(jsonb)') IS NULL THEN
 ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_start_date;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; uid text:=payload->'body'->>'userId'; d date; previous date;
BEGIN
 IF payload->>'operation' IS DISTINCT FROM 'employee-start-date' THEN RETURN tbs_dashboard_auth_before_start_date(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF actor.role NOT IN ('admin','ceo','hr') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Not authorised'); END IF;
 BEGIN
  d:=(payload->'body'->>'startDate')::date;
  IF d IS NULL OR to_char(d,'YYYY-MM-DD') IS DISTINCT FROM payload->'body'->>'startDate' THEN RAISE EXCEPTION 'Invalid date'; END IF;
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose a valid start date'); END;
 SELECT start_date INTO previous FROM tbs_employees WHERE user_id=uid AND employment_type='employee' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Full-time employee not found'); END IF;
 UPDATE tbs_employees SET start_date=d WHERE user_id=uid;
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'employee-start-date',uid||': '||COALESCE(previous::text,'unset')||' -> '||d::text);
 RETURN jsonb_build_object('ok',true,'startDate',d);
END $$;
COMMIT;
