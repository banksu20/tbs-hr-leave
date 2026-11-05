BEGIN;

DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_employee_retirement(jsonb)') IS NULL THEN
 ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_employee_retirement;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; e tbs_employees%ROWTYPE; uid text:=payload->'body'->>'userId'; ids integer[]; jobs uuid[]; code text;
BEGIN
 IF payload->>'operation' NOT IN ('employee-retirement-list','employee-retirement-archive','employee-retirement-restore','employee-permanent-delete') THEN RETURN tbs_dashboard_auth_before_employee_retirement(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF payload->>'operation'='employee-retirement-list' THEN RETURN jsonb_build_object('ok',true,'employees',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',user_id,'code','TBS-'||lpad(tbs_id::text,3,'0'),'name',concat_ws(' ',first_name,last_name),'status',status) ORDER BY tbs_id) FROM tbs_employees WHERE employment_type='employee'),'[]'::jsonb)); END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=uid FOR UPDATE;
 IF e.user_id IS NULL OR e.employment_type<>'employee' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Full-time employee required.'); END IF;
 IF uid IN (SELECT ceo_account_id FROM tbs_cancellation_line_settings WHERE singleton UNION SELECT hr_line_id FROM tbs_policy_routing WHERE singleton UNION SELECT line_id FROM tbs_delivery_admin WHERE singleton)
 OR EXISTS(SELECT 1 FROM tbs_employee_accounts WHERE account_user_id=uid OR employee_user_id=uid) THEN
 RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Protected or linked account. Contact Admin.'); END IF;
 IF payload->>'operation' IN ('employee-retirement-archive','employee-retirement-restore') THEN
  UPDATE tbs_employees SET status=CASE WHEN payload->>'operation'='employee-retirement-archive' THEN 'inactive' ELSE 'active' END WHERE user_id=uid;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,payload->>'operation',uid);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF e.status<>'inactive' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Archive this employee before deleting.'); END IF;
 code:='TBS-'||lpad(e.tbs_id::text,3,'0');
 IF payload->'body'->>'confirmation' IS DISTINCT FROM code THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Enter the exact employee code to confirm.'); END IF;
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
 INSERT INTO tbs_retired_employee_codes(tbs_id,user_id) VALUES(e.tbs_id,uid) ON CONFLICT DO NOTHING;
 DELETE FROM tbs_employees WHERE user_id=uid;
 DELETE FROM tbs_change_history WHERE user_id=uid;
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'employee-permanent-delete',code);
 RETURN jsonb_build_object('ok',true);
END $$;
COMMIT;
