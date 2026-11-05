BEGIN;
-- Persist the authorized dashboard origin so later cancellation/editing still works.
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS university_dashboard_entry boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION tbs_mark_dashboard_university() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.leave_type='university' AND current_setting('app.tbs_quota_override_uid',true)=NEW.user_id THEN
  NEW.university_dashboard_entry:=true;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_tbs_dashboard_university ON leave_requests;
CREATE TRIGGER a_tbs_dashboard_university BEFORE INSERT OR UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_mark_dashboard_university();
DO $$ DECLARE def text; fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['tbs_enforce_leave_policy()','tbs_request_type_guard()'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(fn)) INTO def;
  IF strpos(def,'university_dashboard_entry')=0 THEN
   IF strpos(def,'COALESCE(NEW.reason,'''') !~')=0 THEN RAISE EXCEPTION 'Reason guard not found: %',fn; END IF;
   def:=replace(def,'COALESCE(NEW.reason,'''') !~','NOT (NEW.leave_type=''university'' AND NEW.university_dashboard_entry) AND COALESCE(NEW.reason,'''') !~');
   EXECUTE def;
  END IF;
 END LOOP;
 SELECT pg_get_functiondef('tbs_request_evidence_guard()'::regprocedure) INTO def;
 IF strpos(def,'university_dashboard_entry')=0 THEN
  def:=replace(def,'IF NEW.leave_type=''university'' AND','IF NEW.leave_type=''university'' AND NOT NEW.university_dashboard_entry AND');
  IF strpos(def,'NOT NEW.university_dashboard_entry')=0 THEN RAISE EXCEPTION 'Evidence guard not found'; END IF;
  EXECUTE def;
 END IF;
END $$;
COMMIT;
