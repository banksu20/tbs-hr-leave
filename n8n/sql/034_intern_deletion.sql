BEGIN;
CREATE TABLE IF NOT EXISTS tbs_retired_intern_codes(intern_number integer PRIMARY KEY,deleted_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_intern_delete(jsonb)') IS NULL THEN
 ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_intern_delete;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; e tbs_employees%ROWTYPE; uid text:=payload->'body'->>'userId'; ids integer[]; jobs uuid[]; code text;
BEGIN
 IF payload->>'operation'='employee-type' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Employee type is fixed at registration.'); END IF;
 IF payload->>'operation'<>'intern-delete' THEN RETURN tbs_dashboard_auth_before_intern_delete(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=uid FOR UPDATE;
 IF e.user_id IS NULL OR e.employment_type<>'intern' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Only intern records can be deleted.'); END IF;
 IF e.status<>'inactive' OR NOT EXISTS(SELECT 1 FROM tbs_intern_terms WHERE user_id=uid AND end_date<(now() AT TIME ZONE 'Asia/Bangkok')::date) THEN
 RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Archive this intern after their internship has ended before deleting.'); END IF;
 code:='TBSInterns-'||lpad(e.intern_number::text,greatest(3,length(e.intern_number::text)),'0');
 IF payload->'body'->>'confirmation' IS DISTINCT FROM code THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Enter the exact intern code to confirm.'); END IF;
 IF EXISTS(SELECT 1 FROM tbs_employee_accounts WHERE account_user_id=uid OR employee_user_id=uid) THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Linked accounts require administrator review before deletion.'); END IF;
 IF EXISTS(SELECT 1 FROM leave_requests r WHERE user_id=uid AND (status='Pending' OR status='Approved' AND EXISTS(SELECT 1 FROM unnest(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date)) d WHERE d>=(now() AT TIME ZONE 'Asia/Bangkok')::date))) THEN
 RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Resolve pending or current/future leave before deleting.'); END IF;
 SELECT COALESCE(array_agg(id),'{}') INTO ids FROM leave_requests WHERE user_id=uid;
 SELECT COALESCE(array_agg(id),'{}') INTO jobs FROM tbs_sync_jobs WHERE user_id=uid OR id IN (SELECT job_id FROM tbs_cancellation_line_messages WHERE cancellation_id IN (SELECT id FROM tbs_cancellation_requests WHERE user_id=uid));
 PERFORM 1 FROM tbs_sync_jobs WHERE id=ANY(jobs) FOR UPDATE;
 IF EXISTS(SELECT 1 FROM tbs_sync_jobs WHERE id=ANY(jobs) AND lease_until>now()) THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Delivery is in progress. Try again shortly.'); END IF;
 DELETE FROM tbs_cancellation_line_messages WHERE cancellation_id IN (SELECT id FROM tbs_cancellation_requests WHERE user_id=uid);
 DELETE FROM tbs_cancellation_requests WHERE user_id=uid;
 DELETE FROM tbs_sick_alert_jobs WHERE alert_id IN (SELECT id FROM tbs_sick_alerts WHERE user_id=uid);
 DELETE FROM tbs_sick_alerts WHERE user_id=uid;
 DELETE FROM tbs_sick_milestones WHERE user_id=uid;
 DELETE FROM tbs_personal_alerts WHERE user_id=uid;
 DELETE FROM tbs_sick_language WHERE user_id=uid;
 DELETE FROM tbs_sick_delivery_tests WHERE recipient=uid;
 DELETE FROM tbs_leave_evidence WHERE user_id=uid;
 DELETE FROM tbs_request_accounts WHERE request_id=ANY(ids);
 DELETE FROM leave_requests WHERE user_id=uid;
 DELETE FROM leave_quotas WHERE user_id=uid;
 DELETE FROM tbs_sheet_employee_links WHERE user_id=uid;
 DELETE FROM tbs_leave_exemptions WHERE user_id=uid;
 DELETE FROM tbs_intern_terms WHERE user_id=uid;
 DELETE FROM tbs_registrations WHERE user_id=uid;
 DELETE FROM tbs_sync_jobs WHERE user_id=uid OR id=ANY(jobs);
 INSERT INTO tbs_retired_intern_codes(intern_number) VALUES(e.intern_number) ON CONFLICT DO NOTHING;
 DELETE FROM tbs_employees WHERE user_id=uid;
 DELETE FROM tbs_change_history WHERE user_id=uid;
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'intern-permanent-delete',code);
 RETURN jsonb_build_object('ok',true);
END $$;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_registration(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'COALESCE(max(intern_number),0)+1','greatest(COALESCE(max(intern_number),0),COALESCE((SELECT max(intern_number) FROM tbs_retired_intern_codes),0))+1');EXECUTE def;
END $$;
COMMIT;
