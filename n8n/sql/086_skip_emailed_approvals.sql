BEGIN;
CREATE OR REPLACE FUNCTION tbs_approval_already_handled(payload jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT tbs_approval_request_id(payload) IS NOT NULL AND (
  EXISTS(SELECT 1 FROM tbs_email_decision_links l WHERE l.request_id=tbs_approval_request_id(payload))
  OR NOT EXISTS(SELECT 1 FROM leave_requests r WHERE r.id=tbs_approval_request_id(payload) AND lower(COALESCE(r.status,'')) IN ('pending','awaiting','awaiting approval')));
$$;

CREATE OR REPLACE FUNCTION tbs_line_skip_emailed() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer; BEGIN
 UPDATE tbs_sync_jobs SET completed_generation=generation,retired_at=now(),lease_token=NULL,lease_until=NULL,updated_at=now(),
  retirement_reason='Not sent on LINE: approval already sent by email or decided'
 WHERE kind='line' AND completed_generation<generation AND retired_at IS NULL AND (lease_token IS NULL OR lease_until<now())
  AND tbs_approval_request_id(payload) IS NOT NULL AND tbs_approval_already_handled(payload);
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION tbs_line_quota_release(h tbs_line_held) RETURNS void LANGUAGE plpgsql AS $$
DECLARE nid uuid; BEGIN
 IF tbs_approval_already_handled(h.payload) THEN
  UPDATE tbs_line_held SET released_at=now() WHERE id=h.id;
  RETURN;
 END IF;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',h.user_id,h.payload) RETURNING id INTO nid;
 UPDATE tbs_line_held SET released_at=now(),released_job=nid WHERE id=h.id;
END $$;

CREATE OR REPLACE FUNCTION tbs_claim_line_batch(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
BEGIN
 IF channel='line' AND pg_try_advisory_xact_lock(hashtext('tbs_line_quota')) THEN
  BEGIN
   PERFORM tbs_line_skip_emailed();
   PERFORM tbs_line_quota_guard();
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'LINE quota guard skipped: %',SQLERRM;
  END;
 END IF;
 RETURN QUERY SELECT * FROM tbs_claim_line_batch_before_line_quota(channel);
END $$;
COMMIT;
