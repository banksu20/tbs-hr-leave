-- Stop database-to-Sheets exports without deleting spreadsheet or audit records.
BEGIN;
ALTER TABLE tbs_sync_jobs ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE tbs_sync_jobs ADD COLUMN IF NOT EXISTS retirement_reason text;
CREATE OR REPLACE FUNCTION tbs_queue_sheet(employee text, quota_year integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 RETURN;
END $$;
UPDATE tbs_sync_jobs SET retired_at=COALESCE(retired_at,now()), retirement_reason='Google Sheets export disabled by owner',blocked=true
WHERE kind='sheet' AND completed_generation<generation;
CREATE OR REPLACE FUNCTION tbs_delivery_status() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('ok',true,
 'pending',(SELECT count(*) FROM tbs_sync_jobs WHERE retired_at IS NULL AND completed_generation<generation),
 'failed',(SELECT count(*) FROM tbs_sync_jobs WHERE retired_at IS NULL AND completed_generation<generation AND (blocked OR last_error IS NOT NULL)),
 'jobs',COALESCE((SELECT jsonb_agg(row_to_json(x)) FROM (
 SELECT j.id,j.kind,j.attempts,j.blocked,j.created_at,j.updated_at,
 CASE WHEN j.blocked THEN 'Needs delivery review' WHEN j.last_error IS NOT NULL THEN 'Retry scheduled' ELSE 'Queued' END status,
 COALESCE(NULLIF(concat_ws(' ',e.first_name,e.last_name),''),'Employee') name
 FROM tbs_sync_jobs j LEFT JOIN tbs_employees e ON e.user_id=j.user_id
 WHERE j.retired_at IS NULL AND j.completed_generation<j.generation ORDER BY j.blocked DESC,(j.last_error IS NOT NULL) DESC,j.delivery_order LIMIT 30
 ) x),'[]'::jsonb));
$$;
COMMIT;
