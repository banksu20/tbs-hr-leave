BEGIN;
-- Prevent backdated self-service requests, including emergency exceptions.
-- Dashboard historical corrections remain available to authorised staff.
DO $$ DECLARE def text; marker text := ' IF length(emergency)>2000'; BEGIN
 SELECT pg_get_functiondef('tbs_employee_request(jsonb)'::regprocedure) INTO def;
 IF strpos(def,'Leave cannot be requested for past dates.')=0 THEN
  IF strpos(def,marker)=0 THEN RAISE EXCEPTION 'Employee request validation marker missing'; END IF;
  def:=replace(def,marker,$patch$
 IF EXISTS(SELECT 1 FROM unnest(dates) d WHERE d<(now() AT TIME ZONE 'Asia/Bangkok')::date) THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Leave cannot be requested for past dates.');
 END IF;
 IF length(emergency)>2000$patch$);
  EXECUTE def;
 END IF;
END $$;
-- Keep authenticated decision validation; choose the action directly from LINE.
CREATE OR REPLACE FUNCTION tbs_approval_message(request leave_requests,approvers jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE message jsonb; link text; BEGIN
 message:=tbs_approval_message_before_intern(request,approvers);
 IF EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=request.user_id AND employment_type='intern') THEN
  link:='https://liff.line.me/2008617589-89gR1Y3Y/leave-decision?id='||request.id||'&token='||request.decision_token||'&revision='||md5(to_jsonb(request)::text);
  message:=jsonb_set(message,'{messages,0,contents,footer,contents}',jsonb_build_array(
   jsonb_build_object('type','button','style','primary','action',jsonb_build_object('type','uri','label','Approve','uri',link||'&action=approve')),
   jsonb_build_object('type','button','style','secondary','action',jsonb_build_object('type','uri','label','Reject','uri',link||'&action=reject'))));
 END IF;
 RETURN message;
END $$;
-- AFTER INSERT only: duplicate registration submissions use ON CONFLICT DO
-- NOTHING, so retries cannot enqueue a second notification. No backfill sends.
CREATE OR REPLACE FUNCTION tbs_notify_intern_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient text; BEGIN
 IF NEW.employment_type<>'intern' OR NEW.activated_at IS NOT NULL THEN RETURN NEW; END IF;
 SELECT hr_line_id INTO recipient FROM tbs_policy_routing WHERE singleton;
 IF COALESCE(btrim(recipient),'')='' THEN RAISE EXCEPTION 'HR notification recipient is not configured'; END IF;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',NEW.user_id,
  jsonb_build_object('to',recipient,'messages',jsonb_build_array(jsonb_build_object('type','text','text',
   'New intern registration / มีนักศึกษาฝึกงานลงทะเบียนใหม่'||chr(10)||
   concat_ws(' ',NEW.first_name,NEW.last_name)||CASE WHEN NEW.nickname<>'' THEN ' ('||NEW.nickname||')' ELSE '' END||chr(10)||
   'Department / แผนก: '||NEW.department||chr(10)||
   'Please review and activate the registration / กรุณาตรวจสอบและเปิดใช้งาน'||chr(10)||
   'https://tbs-hr-leave.vercel.app/ceo?view=interns&tab=registrations'))));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_notify_intern_registration ON tbs_registrations;
CREATE TRIGGER tbs_notify_intern_registration AFTER INSERT ON tbs_registrations FOR EACH ROW EXECUTE FUNCTION tbs_notify_intern_registration();
COMMIT;
