BEGIN;
CREATE TABLE IF NOT EXISTS tbs_intern_supervisors(
 user_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 supervisor_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,supervisor_id),
 CHECK(user_id<>supervisor_id));
CREATE OR REPLACE FUNCTION tbs_intern_supervisor_card(request leave_requests,supervisor text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE message jsonb; BEGIN
 message:=tbs_approval_message_before_intern(request,'[]'::jsonb) #- '{messages,0,contents,footer}';
 message:=jsonb_set(message,'{to}',to_jsonb(supervisor));
 message:=jsonb_set(message,'{messages,0,altText}',to_jsonb(left('Intern leave request (FYI): '||request.user_name,300)));
 message:=jsonb_set(message,'{messages,0,contents,body,contents,0,text}',to_jsonb('แจ้งเพื่อทราบ: คำขอลาของนักศึกษาฝึกงาน / FYI: intern leave request'::text));
 message:=jsonb_set(message,'{messages,0,contents,body,contents,0,wrap}','true'::jsonb);
 RETURN jsonb_insert(message,'{messages,0,contents,body,contents,-1}',jsonb_build_object('type','text','size','sm','color','#64748B','wrap',true,
  'text','ส่งให้ HR และ CEO พิจารณาแล้ว ไม่ต้องดำเนินการ / Sent to HR and the CEO for a decision. No action is needed.'),true);
END $$;
DO $$ BEGIN
 IF to_regprocedure('tbs_employee_request_before_supervisor(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_employee_request(jsonb) RENAME TO tbs_employee_request_before_supervisor;
 END IF;
 IF to_regprocedure('tbs_policy_admin_before_supervisor(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_policy_admin(jsonb) RENAME TO tbs_policy_admin_before_supervisor;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_employee_request(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; request leave_requests%ROWTYPE; BEGIN
 result:=tbs_employee_request_before_supervisor(payload);
 IF NOT COALESCE((result->>'ok')::boolean,false) THEN RETURN result; END IF;
 SELECT * INTO request FROM leave_requests WHERE id=(result->>'id')::integer;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload)
 SELECT 'line',request.user_id,tbs_intern_supervisor_card(request,s.supervisor_id) FROM tbs_intern_supervisors s
  JOIN tbs_employees i ON i.user_id=s.user_id AND i.employment_type='intern'
  JOIN tbs_employees e ON e.user_id=s.supervisor_id AND COALESCE(e.status,'active')='active'
  WHERE s.user_id=request.user_id AND NOT tbs_intern_approvers() ? s.supervisor_id ORDER BY s.supervisor_id;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION tbs_policy_admin(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; result jsonb; uid text:=payload->>'userId'; chosen text[]; BEGIN
 IF payload->>'action'='supervisor' THEN
  SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  PERFORM 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Intern not found'); END IF;
  IF jsonb_typeof(payload->'supervisorIds') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'supervisorIds')>10 THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose up to ten supervisors.');
  END IF;
  SELECT COALESCE(array_agg(DISTINCT value),'{}') INTO chosen FROM jsonb_array_elements_text(payload->'supervisorIds');
  IF EXISTS(SELECT 1 FROM unnest(chosen) id WHERE NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=id AND employment_type='employee' AND COALESCE(status,'active')='active')) THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose active full-time employees as supervisors.');
  END IF;
  DELETE FROM tbs_intern_supervisors WHERE user_id=uid AND NOT supervisor_id=ANY(chosen);
  INSERT INTO tbs_intern_supervisors(user_id,supervisor_id) SELECT uid,id FROM unnest(chosen) id ON CONFLICT DO NOTHING;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'intern-supervisor',uid);
  RETURN jsonb_build_object('ok',true);
 END IF;
 result:=tbs_policy_admin_before_supervisor(payload);
 IF payload->>'action'='list' AND COALESCE((result->>'ok')::boolean,false) THEN
  result:=result||jsonb_build_object(
   'supervisors',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',user_id,'name',concat_ws(' ',first_name,last_name)||CASE WHEN COALESCE(nickname,'')<>'' THEN ' ('||nickname||')' ELSE '' END) ORDER BY first_name,last_name) FROM tbs_employees WHERE employment_type='employee' AND COALESCE(status,'active')='active'),'[]'::jsonb),
   'internSupervisors',COALESCE((SELECT jsonb_object_agg(user_id,ids) FROM (SELECT user_id,jsonb_agg(supervisor_id ORDER BY supervisor_id) ids FROM tbs_intern_supervisors GROUP BY user_id) grouped),'{}'::jsonb));
 END IF;
 RETURN result;
END $$;
COMMIT;
