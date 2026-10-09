BEGIN;
-- Preserve full-time cards; intern cards require an authenticated HR decision page.
DO $$ BEGIN IF to_regprocedure('tbs_approval_message_before_intern(leave_requests,jsonb)') IS NULL THEN ALTER FUNCTION tbs_approval_message(leave_requests,jsonb) RENAME TO tbs_approval_message_before_intern; END IF; END $$;
CREATE OR REPLACE FUNCTION tbs_approval_message(request leave_requests,approvers jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE message jsonb; link text; BEGIN
 message:=tbs_approval_message_before_intern(request,approvers);
 IF EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=request.user_id AND employment_type='intern') THEN
  link:='https://liff.line.me/2008617589-89gR1Y3Y/leave-decision?id='||request.id||'&token='||request.decision_token||'&revision='||md5(to_jsonb(request)::text);
  message:=jsonb_set(message,'{messages,0,contents,footer,contents}',jsonb_build_array(
   jsonb_build_object('type','button','style','primary','action',jsonb_build_object('type','uri','label','Review request','uri',link))));
 END IF;RETURN message;END $$;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_queue_cancellation_line(bigint)'::regprocedure) INTO def;
 def:=replace(def,'VALUES(c.id,setting.ceo_account_id)','VALUES(c.id,CASE WHEN EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=r.user_id AND employment_type=''intern'') THEN (SELECT hr_line_id FROM tbs_policy_routing WHERE singleton) ELSE setting.ceo_account_id END)');EXECUTE def;
 IF to_regprocedure('tbs_line_decision_before_intern(text,jsonb)') IS NULL THEN ALTER FUNCTION tbs_line_decision(text,jsonb) RENAME TO tbs_line_decision_before_intern; END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_line_decision(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM leave_requests r JOIN tbs_employees e USING(user_id) WHERE r.id=(payload->>'id')::int AND e.employment_type='intern') AND COALESCE(payload->>'accountId','') IS DISTINCT FROM (SELECT hr_line_id FROM tbs_policy_routing WHERE singleton) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Open this request using Nam’s LINE account.');END IF;
 RETURN tbs_line_decision_before_intern(operation,payload);END $$;
CREATE OR REPLACE FUNCTION tbs_intern_decision(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r leave_requests%ROWTYPE; BEGIN
 IF COALESCE(payload->>'accountId','') IS DISTINCT FROM (SELECT hr_line_id FROM tbs_policy_routing WHERE singleton) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Open this request using Nam’s LINE account.');END IF;
 SELECT * INTO r FROM leave_requests WHERE id=(payload->>'id')::int;
 IF r.id IS NULL OR r.decision_token::text IS DISTINCT FROM payload->>'token' OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=r.user_id AND employment_type='intern') THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Request unavailable');END IF;
 IF r.status<>'Pending' OR md5(to_jsonb(r)::text) IS DISTINCT FROM payload->>'revision' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Already decided or changed. Open the latest request.');END IF;
 IF payload->>'action'='review' THEN RETURN jsonb_build_object('ok',true,'request',jsonb_build_object('name',r.user_name,'type',r.leave_type,'dates',r.selected_dates,'days',r.leave_days,'reason',r.reason)); END IF;
 IF payload->>'action' NOT IN ('approve','reject') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid decision'); END IF;
 RETURN tbs_line_decision(payload->>'action',payload||jsonb_build_object('userId',r.user_id,'expectedRevision',payload->>'revision','decisionToken',payload->>'token','rejectionReason',COALESCE(payload->>'reason','')));
END $$;
-- University entries remain editable through the same request mutation path.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_dashboard_request(text,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'''annual'', ''sick'', ''personal''','''annual'', ''sick'', ''personal'', ''university''');EXECUTE def;
END $$;

CREATE OR REPLACE FUNCTION tbs_request_type_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='Rejected' THEN RETURN NEW;END IF;
 IF NEW.leave_type='university' AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type='intern') THEN RAISE EXCEPTION 'University activities are for interns only' USING ERRCODE='P2001';END IF;
 IF (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.reason IS DISTINCT FROM OLD.reason) AND COALESCE(NEW.reason,'') !~ '[^[:space:]]' THEN RAISE EXCEPTION 'Please enter a reason for this leave' USING ERRCODE='P2001';END IF;
 RETURN NEW;END $$;
DROP TRIGGER IF EXISTS tbs_request_type_guard ON leave_requests;
CREATE TRIGGER tbs_request_type_guard BEFORE INSERT OR UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_request_type_guard();
COMMIT;
