-- Only annual/vacation leave has an optional reason, for both employee types.
BEGIN;
DO $$ DECLARE def text; fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['tbs_employee_request_before_intern(jsonb)','tbs_enforce_leave_policy()','tbs_request_type_guard()'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(fn)) INTO def;
  def:=replace(def,'NOT IN (''personal'',''annual'',''vacation'')','NOT IN (''annual'',''vacation'')');
  IF def IS NULL OR strpos(def,'NOT IN (''annual'',''vacation'')')=0 THEN RAISE EXCEPTION 'Reason guard not found: %',fn; END IF;
  EXECUTE def;
 END LOOP;
END $$;
COMMIT;
