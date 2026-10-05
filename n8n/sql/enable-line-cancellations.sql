-- Run through n8n PostgreSQL ONLY AFTER deploying /cancel-decision and its API.
BEGIN;
UPDATE tbs_cancellation_line_settings SET enabled=true WHERE singleton;
SELECT id,tbs_queue_cancellation_line(id) AS queued FROM tbs_cancellation_requests WHERE status='Pending' ORDER BY id;
COMMIT;
