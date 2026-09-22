-- Apply through an n8n PostgreSQL node. No messages or sheet writes during migration.
BEGIN;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS decision_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE IF NOT EXISTS tbs_sync_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('sheet','line')),
 user_id text NOT NULL, year integer, payload jsonb NOT NULL DEFAULT '{}',
 generation bigint NOT NULL DEFAULT 1, completed_generation bigint NOT NULL DEFAULT 0,
 lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 first_attempt_at timestamptz, last_error text, blocked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tbs_sheet_job_unique ON tbs_sync_jobs(user_id,year) WHERE kind='sheet';
CREATE OR REPLACE FUNCTION tbs_queue_sheet(employee text, quota_year integer) RETURNS void LANGUAGE sql AS $$
 INSERT INTO tbs_sync_jobs(kind,user_id,year) VALUES('sheet',employee,quota_year)
 ON CONFLICT(user_id,year) WHERE kind='sheet' DO UPDATE
 SET generation=tbs_sync_jobs.generation+1,updated_at=now(),blocked=false;
$$;
CREATE OR REPLACE FUNCTION tbs_queue_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; years integer[]; y integer; r jsonb; dates text; text_message text;
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'updated_at')=(to_jsonb(NEW)-'updated_at') THEN RETURN NEW; END IF;
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='leave_requests' THEN
   IF TG_OP<>'INSERT' THEN
     FOR d IN SELECT unnest(tbs_request_dates(OLD.selected_dates,OLD.start_date::date,OLD.end_date::date)) LOOP
       years:=array_append(years,extract(year FROM d)::int);
     END LOOP;
   END IF;
   IF TG_OP<>'DELETE' THEN
     FOR d IN SELECT unnest(tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date)) LOOP
       years:=array_append(years,extract(year FROM d)::int);
     END LOOP;
   END IF;
   IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Approved','Rejected') THEN
     dates:=array_to_string(tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date),', ');
     text_message:=format('Leave request #%s: %s / %s%sDates: %s%sType: %s · %s day(s)%s%s',NEW.id,
       NEW.status,CASE WHEN NEW.status='Approved' THEN 'อนุมัติแล้ว' ELSE 'ไม่อนุมัติ/ยกเลิก' END,chr(10),dates,chr(10),
       NEW.leave_type,NEW.leave_days,CASE WHEN NEW.half_day_period IS NULL THEN '' ELSE ' · '||NEW.half_day_period END,
       CASE WHEN NEW.rejection_reason IS NULL THEN '' ELSE chr(10)||'Reason: '||NEW.rejection_reason END);
     INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',NEW.user_id,jsonb_build_object('to',NEW.user_id,'messages',jsonb_build_array(jsonb_build_object('type','text','text',text_message))));
   END IF;
 ELSIF TG_TABLE_NAME='leave_quotas' THEN years:=ARRAY[(r->>'year')::int];
 ELSE SELECT array_agg(DISTINCT year) INTO years FROM leave_quotas WHERE user_id=r->>'user_id';
 END IF;
 FOR y IN SELECT DISTINCT unnest(years) LOOP PERFORM tbs_queue_sheet(r->>'user_id',y); END LOOP;
 RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS tbs_sync_leave ON leave_requests;
CREATE TRIGGER tbs_sync_leave AFTER INSERT OR UPDATE OR DELETE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_queue_change();
DROP TRIGGER IF EXISTS tbs_sync_quota ON leave_quotas;
CREATE TRIGGER tbs_sync_quota AFTER INSERT OR UPDATE OR DELETE ON leave_quotas FOR EACH ROW EXECUTE FUNCTION tbs_queue_change();
DROP TRIGGER IF EXISTS tbs_sync_employee ON tbs_employees;
CREATE TRIGGER tbs_sync_employee AFTER UPDATE ON tbs_employees FOR EACH ROW EXECUTE FUNCTION tbs_queue_change();

CREATE OR REPLACE FUNCTION tbs_claim_sync(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
DECLARE job tbs_sync_jobs%ROWTYPE;
BEGIN
 -- One worker per channel. Prevent an expired old sheet snapshot overtaking a newer snapshot.
 PERFORM pg_advisory_xact_lock(hashtext('tbs_sync_'||channel));
 IF EXISTS(SELECT 1 FROM tbs_sync_jobs WHERE kind=channel AND lease_until>now()) THEN RETURN; END IF;
 UPDATE tbs_sync_jobs SET blocked=true,last_error='Delivery outcome needs review: retry window expired'
 WHERE kind='line' AND completed_generation<generation AND first_attempt_at<now()-interval '23 hours';
 SELECT * INTO job FROM tbs_sync_jobs WHERE kind=channel AND completed_generation<generation AND NOT blocked
   AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE tbs_sync_jobs SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,
   first_attempt_at=COALESCE(first_attempt_at,now()) WHERE id=job.id RETURNING * INTO job;
 RETURN NEXT job;
END;
$$;
CREATE OR REPLACE FUNCTION tbs_finish_sync(job_id uuid, lease uuid, claimed_generation bigint, error_message text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 UPDATE tbs_sync_jobs SET completed_generation=CASE WHEN error_message IS NULL THEN greatest(completed_generation,claimed_generation) ELSE completed_generation END,
 lease_until=CASE WHEN error_message IS NULL THEN NULL ELSE now()+interval '5 minutes' END,lease_token=NULL,last_error=left(error_message,1000),updated_at=now()
 WHERE id=job_id AND lease_token=lease;
 RETURN FOUND;
END;
$$;
COMMIT;
