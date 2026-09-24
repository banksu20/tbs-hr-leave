-- One-time, guarded merge explicitly authorized by owner: TBS030 is main; exclude tests.
-- Preserve original rows/quotas/history in a database archive. No LINE messages are sent.
BEGIN;
LOCK TABLE tbs_employees, leave_requests, leave_quotas, tbs_sync_jobs IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE main_id text; secondary_id text;
BEGIN
 IF EXISTS(SELECT 1 FROM tbs_account_merge_archive WHERE merge_key='alice-033-to-030-20260924') THEN RETURN; END IF;
 IF (SELECT count(*) FROM tbs_employees WHERE tbs_id=30)<>1 OR (SELECT count(*) FROM tbs_employees WHERE tbs_id=33)<>1 THEN RAISE EXCEPTION 'Employee IDs are ambiguous'; END IF;
 SELECT user_id INTO main_id FROM tbs_employees WHERE tbs_id=30 AND first_name='Intuon' AND last_name='Suphannarat' AND status='active';
 SELECT user_id INTO secondary_id FROM tbs_employees WHERE tbs_id=33 AND first_name='Intuon' AND last_name='Suphannarat' AND status='active';
 IF main_id IS NULL OR secondary_id IS NULL THEN RAISE EXCEPTION 'Employee identity changed'; END IF;
 IF EXISTS(SELECT 1 FROM tbs_employee_accounts WHERE account_user_id IN(main_id,secondary_id) OR employee_user_id=secondary_id) THEN RAISE EXCEPTION 'Existing account link requires review'; END IF;
 IF EXISTS(SELECT 1 FROM leave_requests WHERE user_id=secondary_id AND id NOT IN(1054,1059,1060,1061,1063))
 OR (SELECT count(*) FROM leave_requests WHERE user_id=secondary_id AND id IN(1054,1059,1060,1061) AND status='Rejected' AND reason ILIKE '%TEST%')<>4
 OR NOT EXISTS(SELECT 1 FROM leave_requests WHERE id=1063 AND user_id=secondary_id AND status='Approved' AND leave_type='sick' AND leave_days=1 AND selected_dates='2026-09-24')
 THEN RAISE EXCEPTION 'Requests changed; inspect again before merging'; END IF;
 IF EXISTS(SELECT 1 FROM tbs_sync_jobs WHERE user_id IN(main_id,secondary_id) AND lease_until>now()) THEN RAISE EXCEPTION 'A sync is running; retry after it finishes'; END IF;
 INSERT INTO tbs_account_merge_archive(merge_key,snapshot)
 SELECT 'alice-033-to-030-20260924',jsonb_build_object(
 'employees',(SELECT jsonb_agg(to_jsonb(e)) FROM tbs_employees e WHERE user_id IN(main_id,secondary_id)),
 'quotas',(SELECT jsonb_agg(to_jsonb(q)) FROM leave_quotas q WHERE user_id IN(main_id,secondary_id)),
 'requests',(SELECT jsonb_agg(to_jsonb(r)) FROM leave_requests r WHERE user_id IN(main_id,secondary_id)),
 'history',(SELECT jsonb_agg(to_jsonb(h)) FROM tbs_change_history h WHERE user_id IN(main_id,secondary_id)),
 'sheetLinks',(SELECT jsonb_agg(to_jsonb(l)) FROM tbs_sheet_employee_links l WHERE user_id IN(main_id,secondary_id)),
 'jobs',(SELECT jsonb_agg(to_jsonb(j)) FROM tbs_sync_jobs j WHERE user_id IN(main_id,secondary_id)));
 -- Preserve which LINE account receives future decision notifications.
 INSERT INTO tbs_request_accounts(request_id,account_user_id) VALUES(1063,secondary_id);
 UPDATE leave_requests SET user_id=main_id WHERE id=1063;
 -- Follow the genuine request's existing audit trail without copying test history.
 UPDATE tbs_change_history SET user_id=main_id WHERE entity='leave_requests' AND record_id='1063';
 UPDATE tbs_employees SET status='inactive' WHERE user_id=secondary_id;
 INSERT INTO tbs_employee_accounts(account_user_id,employee_user_id) VALUES(secondary_id,main_id);
 -- Keep archived tests and test quota unchanged, but never queue another test-tab update.
 UPDATE tbs_sync_jobs SET blocked=true,last_error='Archived account merged into TBS030' WHERE user_id=secondary_id AND completed_generation<generation;
 INSERT INTO tbs_sheet_employee_links(user_id,year,sheet_name,header,evidence,database_authoritative)
 VALUES(main_id,2026,'Leave report 2026','Name :  Alice','User confirmed TBS030 and TBS033 are Alice; exact unique header inspected 24 Sep 2026',true)
 ON CONFLICT(user_id,year) DO UPDATE SET sheet_name=EXCLUDED.sheet_name,header=EXCLUDED.header,evidence=EXCLUDED.evidence,database_authoritative=true,verified_at=now();
 PERFORM tbs_queue_sheet(main_id,2026);
END;
$$;
COMMIT;
