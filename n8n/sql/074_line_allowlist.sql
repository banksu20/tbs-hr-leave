BEGIN;
CREATE OR REPLACE FUNCTION tbs_line_job_wanted(payload jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT tbs_approval_request_id(payload) IS NOT NULL
  OR COALESCE(payload#>>'{messages,0,altText}','') ~ '^(อนุมัติแล้ว / Approved|ไม่อนุมัติ / Leave rejected)';
$$;
CREATE OR REPLACE FUNCTION tbs_line_allowlist() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='line' AND NOT tbs_line_job_wanted(NEW.payload) THEN
  NEW.completed_generation:=NEW.generation;
  NEW.retired_at:=COALESCE(NEW.retired_at,now());
  NEW.retirement_reason:='Not sent: LINE only carries leave requests and decisions';
  NEW.lease_token:=NULL;
  NEW.lease_until:=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_tbs_line_allowlist ON tbs_sync_jobs;
CREATE TRIGGER zz_tbs_line_allowlist BEFORE INSERT OR UPDATE ON tbs_sync_jobs FOR EACH ROW EXECUTE FUNCTION tbs_line_allowlist();
UPDATE tbs_sync_jobs SET updated_at=now() WHERE kind='line' AND completed_generation<generation AND NOT tbs_line_job_wanted(payload);
COMMIT;
