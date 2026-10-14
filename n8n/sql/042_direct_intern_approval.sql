BEGIN;
CREATE OR REPLACE FUNCTION tbs_intern_action_buttons(request_id integer,uid text,token text,revision text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_array(
 jsonb_build_object('type','button','style','primary','action',jsonb_build_object('type','postback','label','Approve','data','action=approve&db_id='||request_id||'&userId='||uid||'&revision='||revision||'&token='||token)),
 jsonb_build_object('type','button','style','secondary','action',jsonb_build_object('type','uri','label','Reject','uri','https://liff.line.me/2008617589-89gR1Y3Y/leave-decision?id='||request_id||'&token='||token||'&revision='||revision||'&action=reject')));
$$;
CREATE OR REPLACE FUNCTION tbs_approval_message(request leave_requests,approvers jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE message jsonb; BEGIN
 message:=tbs_approval_message_before_intern(request,approvers);
 IF EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=request.user_id AND employment_type='intern') THEN
 message:=jsonb_set(message,'{messages,0,contents,footer,contents}',tbs_intern_action_buttons(request.id,request.user_id,request.decision_token::text,md5(to_jsonb(request)::text)));
 END IF; RETURN message;
END $$;
CREATE OR REPLACE FUNCTION tbs_isolated_intern_card(test_id integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t tbs_intern_decision_tests%ROWTYPE; r leave_requests%ROWTYPE; message jsonb; BEGIN
 SELECT * INTO STRICT t FROM tbs_intern_decision_tests WHERE id=test_id;
 IF EXISTS(SELECT 1 FROM leave_requests WHERE id=t.id) THEN RAISE EXCEPTION 'Test ID conflicts with a real request'; END IF;
 r:=jsonb_populate_record(NULL::leave_requests,t.snapshot||jsonb_build_object('id',t.id,'decision_token',t.token));
 message:=tbs_approval_message_before_intern(r,jsonb_build_array(t.recipient));
 RETURN jsonb_set(message,'{messages,0,contents,footer,contents}',tbs_intern_action_buttons(t.id,r.user_id,t.token::text,t.revision));
END $$;
-- Tests use the same postback route but can mutate only the isolated fixture.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_line_decision(text,jsonb)'::regprocedure) INTO def;
 IF strpos(def,'tbs_isolated_intern_decision')=0 THEN
 def:=regexp_replace(def,'BEGIN',$patch$BEGIN
 IF EXISTS(SELECT 1 FROM tbs_intern_decision_tests WHERE id=(payload->>'id')::integer) THEN
  RETURN tbs_isolated_intern_decision(payload||jsonb_build_object('action',operation,'token',payload->>'decisionToken','revision',payload->>'expectedRevision'));
 END IF;
$patch$); EXECUTE def;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_registration_card(first_name text,last_name text,nickname text,department text,is_test boolean DEFAULT false) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('type','flex','altText',CASE WHEN is_test THEN 'TEST ONLY · ' ELSE '' END||'New intern registration: '||left(first_name||' '||last_name,200),
 'contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','spacing','md','contents',jsonb_build_array(
 jsonb_build_object('type','text','text',CASE WHEN is_test THEN 'TEST ONLY · NEW INTERN' ELSE 'NEW INTERN REGISTRATION' END,'weight','bold','color','#0099B5','wrap',true),
 jsonb_build_object('type','text','text',left(first_name||' '||last_name||CASE WHEN COALESCE(nickname,'')<>'' THEN ' ('||nickname||')' ELSE '' END,200),'size','lg','weight','bold','wrap',true),
 jsonb_build_object('type','text','text','Department / แผนก: '||left(department,100),'wrap',true),
 jsonb_build_object('type','text','text',CASE WHEN is_test THEN 'Dale-only preview. No intern was registered.' ELSE 'Awaiting HR activation / รอ HR ตรวจสอบและเปิดใช้งาน' END,'color','#64748B','wrap',true))),
 'footer',jsonb_build_object('type','box','layout','vertical','contents',jsonb_build_array(jsonb_build_object('type','button','style','primary','action',jsonb_build_object('type','uri','label','Review registration','uri','https://tbs-hr-leave.vercel.app/ceo?view=interns&tab=registrations'))))));
$$;
CREATE OR REPLACE FUNCTION tbs_notify_intern_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient text; BEGIN
 IF NEW.employment_type<>'intern' OR NEW.activated_at IS NOT NULL THEN RETURN NEW; END IF;
 SELECT hr_line_id INTO recipient FROM tbs_policy_routing WHERE singleton;
 IF COALESCE(btrim(recipient),'')='' THEN RAISE EXCEPTION 'HR notification recipient is not configured'; END IF;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',NEW.user_id,jsonb_build_object('to',recipient,'messages',jsonb_build_array(tbs_registration_card(NEW.first_name,NEW.last_name,NEW.nickname,NEW.department))));
 RETURN NEW;
END $$;
COMMIT;
