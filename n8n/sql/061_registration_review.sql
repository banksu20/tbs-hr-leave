BEGIN;
ALTER TABLE tbs_registrations ADD COLUMN IF NOT EXISTS correction_pending boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS tbs_retired_employee_codes(tbs_id integer PRIMARY KEY,user_id text UNIQUE NOT NULL,deleted_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION tbs_registration(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=payload->>'accountId'; actor tbs_dashboard_accounts%ROWTYPE; reg tbs_registrations%ROWTYPE; employee tbs_employees%ROWTYPE; n integer; tn integer; BEGIN
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF payload->>'action'='list' THEN
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  RETURN jsonb_build_object('ok',true,'registrations',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at) FROM tbs_registrations r WHERE activated_at IS NULL),'[]'::jsonb));
 END IF;
 IF payload->>'action'='activate' THEN
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  SELECT * INTO reg FROM tbs_registrations WHERE user_id=payload->>'userId' FOR UPDATE;
  IF reg.user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Registration unavailable'); END IF;
  IF reg.activated_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  IF NULLIF(payload->>'startDate','') IS NULL OR (reg.employment_type='intern' AND (NULLIF(payload->>'endDate','') IS NULL OR (payload->>'endDate')::date<(payload->>'startDate')::date)) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose valid employment dates'); END IF;
  LOCK TABLE tbs_employees IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=reg.user_id) AND NOT (reg.correction_pending AND reg.employment_type='intern' AND EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=reg.user_id AND employment_type='intern' AND status='inactive') AND NOT EXISTS(SELECT 1 FROM tbs_intern_terms WHERE user_id=reg.user_id)) THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Employee already exists. Review their existing profile.'); END IF;
  SELECT greatest(COALESCE(max(tbs_id),0),COALESCE((SELECT max(tbs_id) FROM tbs_retired_employee_codes),0))+1,greatest(COALESCE(max(intern_number),0),COALESCE((SELECT max(intern_number) FROM tbs_retired_intern_codes),0))+1 INTO n,tn FROM tbs_employees;
  INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,nickname,department,status,employment_type,intern_number,start_date)
  VALUES(reg.user_id,n,reg.first_name,reg.last_name,reg.nickname,reg.department,'active',reg.employment_type,CASE WHEN reg.employment_type='intern' THEN tn END,(payload->>'startDate')::date) ON CONFLICT(user_id) DO UPDATE SET status='active',start_date=excluded.start_date;
  IF reg.employment_type='intern' THEN
   INSERT INTO tbs_intern_terms VALUES(reg.user_id,(payload->>'startDate')::date,(payload->>'endDate')::date,NULL::numeric);
  ELSE
   IF (payload->>'annualTotal')::numeric<0 THEN RAISE EXCEPTION 'Invalid annual allowance'; END IF;
   INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES(reg.user_id,extract(year FROM now() AT TIME ZONE 'Asia/Bangkok')::integer,(payload->>'annualTotal')::numeric,30,3,0);
  END IF;
  UPDATE tbs_registrations SET activated_at=now(),correction_pending=false WHERE user_id=reg.user_id;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'registration-activate',reg.user_id);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF COALESCE(uid,'')='' THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','LINE sign in required'); END IF;
 IF EXISTS(SELECT 1 FROM tbs_retired_employee_codes WHERE user_id=uid) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','This employee account has been removed. Contact HR.'); END IF;
 PERFORM pg_advisory_xact_lock(hashtext(uid));
 SELECT * INTO employee FROM tbs_employees WHERE user_id=tbs_resolve_employee(uid);
 IF employee.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM tbs_registrations WHERE user_id=employee.user_id AND correction_pending AND activated_at IS NULL) THEN RETURN jsonb_build_object('ok',true,'found',false,'pending',true,'employmentType','intern'); END IF;
 IF employee.user_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'found',employee.status='active','inactive',employee.status<>'active','name',concat_ws('|',employee.first_name,employee.last_name,employee.nickname),'department',employee.department); END IF;
 IF payload->>'action'='submit' THEN
  IF length(btrim(COALESCE(payload->>'firstName','')))=0 OR length(btrim(COALESCE(payload->>'lastName','')))=0 OR length(btrim(COALESCE(payload->>'department','')))=0 OR COALESCE(payload->>'employmentType','') NOT IN ('employee','intern') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Complete your name, department and employment type'); END IF;
  INSERT INTO tbs_registrations(user_id,first_name,last_name,nickname,department,employment_type) VALUES(uid,btrim(payload->>'firstName'),btrim(payload->>'lastName'),btrim(COALESCE(payload->>'nickname','')),payload->>'department',payload->>'employmentType') ON CONFLICT DO NOTHING;
 END IF;
 SELECT * INTO reg FROM tbs_registrations WHERE user_id=uid;
 RETURN jsonb_build_object('ok',true,'found',false,'pending',reg.user_id IS NOT NULL,'employmentType',reg.employment_type);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR datetime_field_overflow THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid activation details');
END $$;
-- Full-time registrations now require review; notify both existing approvers once.
CREATE OR REPLACE FUNCTION tbs_notify_intern_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient text; card jsonb;
BEGIN
 IF NEW.activated_at IS NOT NULL THEN RETURN NEW; END IF;
 card:=tbs_registration_card(NEW.first_name,NEW.last_name,NEW.nickname,NEW.department);
 IF NEW.employment_type='employee' THEN
  card:=jsonb_set(card,'{altText}',to_jsonb('New full-time registration: '||NEW.first_name||' '||NEW.last_name));
  card:=jsonb_set(card,'{contents,body,contents,0,text}','"NEW FULL-TIME REGISTRATION / พนักงานประจำสมัครใหม่"');
 END IF;
 card:=jsonb_set(card,'{contents,body,contents,3,text}','"Awaiting approval by Dan or Nam / รอ Dan หรือ Nam ตรวจสอบและเปิดใช้งาน"');
 card:=jsonb_set(card,'{contents,footer,contents,0,action,uri}','"https://tbs-hr-leave.vercel.app/ceo?view=registrations"');
 FOR recipient IN SELECT jsonb_array_elements_text(tbs_intern_approvers()) LOOP
  INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',NEW.user_id,jsonb_build_object('to',recipient,'messages',jsonb_build_array(card)));
 END LOOP;
 RETURN NEW;
END $$;
COMMIT;
