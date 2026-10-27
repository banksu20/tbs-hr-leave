-- Annual/vacation and personal leave reasons are optional for both employee types.
BEGIN;
DO $$ DECLARE def text; fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['tbs_employee_request_before_intern(jsonb)','tbs_enforce_leave_policy()','tbs_request_type_guard()'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(fn)) INTO def;
  def:=replace(def,'lower(payload->>''leaveType'') IS DISTINCT FROM ''personal''', 'COALESCE(lower(payload->>''leaveType''),'''') NOT IN (''personal'',''annual'',''vacation'')');
  def:=replace(def,'lower(NEW.leave_type) IS DISTINCT FROM ''personal''', 'COALESCE(lower(NEW.leave_type),'''') NOT IN (''personal'',''annual'',''vacation'')');
  IF strpos(def,'NOT IN (''personal'',''annual'',''vacation'')')=0 THEN RAISE EXCEPTION 'Reason guard not found: %',fn; END IF;
  EXECUTE def;
 END LOOP;
END $$;
COMMIT;
