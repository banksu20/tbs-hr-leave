-- Annual leave can be submitted late for normal approval, with an explanation.
BEGIN;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_employee_request(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'kind NOT IN (''sick'',''personal'')','kind NOT IN (''sick'',''personal'',''annual'')');
 def:=replace(def,'Emergency exceptions apply only to sick and personal leave.','Deadline exceptions apply only to sick, personal and annual leave.');
 def:=replace(def,'The request deadline has passed. Sick or personal emergencies need an explanation.','The request deadline has passed. Explain an emergency or request late annual approval.');
 IF strpos(def,'kind NOT IN (''sick'',''personal'',''annual'')')=0 THEN RAISE EXCEPTION 'Deadline exception guard not found'; END IF;
 EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION tbs_request_emergency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE explanation text; label text;
BEGIN
 explanation:=btrim(COALESCE(current_setting('app.tbs_emergency',true),''));
 NEW.emergency_reason:=explanation;
 IF explanation<>'' THEN
  label:=CASE WHEN lower(NEW.leave_type) IN ('annual','vacation') THEN 'ขออนุมัติลาหลังเวลาที่กำหนด / Late annual request: ' ELSE 'เหตุฉุกเฉิน / Emergency: ' END;
  NEW.reason:=CASE WHEN btrim(COALESCE(NEW.reason,'')) IN ('',explanation) THEN label||explanation ELSE NEW.reason||E'\n\n'||label||explanation END;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
