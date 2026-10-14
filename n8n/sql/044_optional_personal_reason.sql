-- Personal leave reasons are optional for both cohorts. Other policy guards remain.
BEGIN;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_employee_request_before_intern(jsonb)'::regprocedure) INTO def;
 def:=replace(def,
  'IF jsonb_typeof(payload->''reason'') IS DISTINCT FROM ''string'' OR COALESCE(payload->>''reason'','''') !~ ''[^[:space:]]'' THEN',
  'IF lower(payload->>''leaveType'') IS DISTINCT FROM ''personal'' AND (jsonb_typeof(payload->''reason'') IS DISTINCT FROM ''string'' OR COALESCE(payload->>''reason'','''') !~ ''[^[:space:]]'') THEN');
 def:=replace(def,'to_jsonb(btrim(payload->>''reason''))','to_jsonb(btrim(COALESCE(payload->>''reason'','''')))');
 EXECUTE def;
 SELECT pg_get_functiondef('tbs_enforce_leave_policy()'::regprocedure) INTO def;
 def:=replace(def,'IF TG_OP=''INSERT'' AND COALESCE(NEW.reason,'''')', 'IF TG_OP=''INSERT'' AND lower(NEW.leave_type) IS DISTINCT FROM ''personal'' AND COALESCE(NEW.reason,'''')');
 EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION tbs_request_type_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='Rejected' THEN RETURN NEW; END IF;
 IF NEW.leave_type='university' AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type='intern') THEN RAISE EXCEPTION 'University activities are for interns only' USING ERRCODE='P2001'; END IF;
 IF lower(NEW.leave_type) IS DISTINCT FROM 'personal'
 AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.leave_type IS DISTINCT FROM OLD.leave_type)
 AND COALESCE(NEW.reason,'') !~ '[^[:space:]]' THEN RAISE EXCEPTION 'Please enter a reason for this leave' USING ERRCODE='P2001'; END IF;
 RETURN NEW;
END $$;
COMMIT;
