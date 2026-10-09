BEGIN;
-- Bind validated submission attachments in the same transaction as the request.
CREATE OR REPLACE FUNCTION tbs_request_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids uuid[]; BEGIN
 IF TG_OP='INSERT' THEN
  SELECT COALESCE(array_agg(value::uuid),'{}') INTO ids FROM jsonb_array_elements_text(COALESCE(NULLIF(current_setting('app.tbs_evidence_ids',true),'')::jsonb,'[]'));
  UPDATE tbs_leave_evidence SET request_id=NEW.id WHERE id=ANY(ids) AND user_id=NEW.user_id AND request_id IS NULL;
 END IF;
 IF NEW.leave_type='university' AND NEW.status<>'Rejected' AND NOT EXISTS(SELECT 1 FROM tbs_leave_evidence WHERE request_id=NEW.id AND user_id=NEW.user_id) THEN
  RAISE EXCEPTION 'Attach supporting evidence before saving or approving university activity leave.' USING ERRCODE='P2001';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_request_evidence_guard ON leave_requests;
CREATE TRIGGER tbs_request_evidence_guard AFTER INSERT OR UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_request_evidence_guard();
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_employee_request(jsonb)'::regprocedure) INTO def;
 IF position('app.tbs_evidence_ids' IN def)=0 THEN
  def:=replace(def,'previous text;','previous text; previous_evidence text;');
  def:=replace(def,'result:=tbs_employee_request_before_intern(', E'previous_evidence:=COALESCE(current_setting(''app.tbs_evidence_ids'',true),'''');PERFORM set_config(''app.tbs_evidence_ids'',to_jsonb(evidence)::text,true);\n result:=tbs_employee_request_before_intern(');
  def:=replace(def,'RETURN result;', E'PERFORM set_config(''app.tbs_evidence_ids'',previous_evidence,true);\n RETURN result;');EXECUTE def;
 END IF;
 SELECT pg_get_functiondef('tbs_employee_request_before_intern(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'IF (result->>''ok'')::boolean AND medical THEN','IF (result->>''ok'')::boolean AND medical AND NOT EXISTS(SELECT 1 FROM tbs_leave_evidence WHERE request_id=(result->>''id'')::integer) THEN');
 def:=replace(def,'''messages'',jsonb_build_array(card)', '''messages'',jsonb_build_array(card),''medicalRequestId'',(result->>''id'')::integer');EXECUTE def;
END $$;
-- A certificate uploaded after submission cancels only unsent reminders for that request.
CREATE OR REPLACE FUNCTION tbs_evidence_medical_received() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.request_id IS NOT NULL THEN
  DELETE FROM tbs_sync_jobs WHERE kind='line' AND (payload->>'medicalRequestId')::integer=NEW.request_id AND completed_generation<generation AND (lease_until IS NULL OR lease_until<now());
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_evidence_medical_received ON tbs_leave_evidence;
CREATE TRIGGER tbs_evidence_medical_received AFTER INSERT OR UPDATE OF request_id ON tbs_leave_evidence FOR EACH ROW EXECUTE FUNCTION tbs_evidence_medical_received();
COMMIT;
