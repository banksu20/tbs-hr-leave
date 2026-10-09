BEGIN;
CREATE TABLE IF NOT EXISTS tbs_registrations (
 user_id text PRIMARY KEY, first_name text NOT NULL, last_name text NOT NULL, nickname text NOT NULL DEFAULT '', department text NOT NULL,
 employment_type text NOT NULL CHECK(employment_type IN ('employee','intern')), created_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz
);
CREATE OR REPLACE FUNCTION tbs_registration(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=payload->>'accountId'; actor tbs_dashboard_accounts%ROWTYPE; reg tbs_registrations%ROWTYPE; employee tbs_employees%ROWTYPE; n integer; tn integer; BEGIN
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF payload->>'action'='list' THEN
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  RETURN jsonb_build_object('ok',true,'registrations',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at) FROM tbs_registrations r WHERE activated_at IS NULL AND (actor.role<>'hr' OR employment_type='intern')),'[]'::jsonb));
 END IF;
 IF payload->>'action'='activate' THEN
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  SELECT * INTO reg FROM tbs_registrations WHERE user_id=payload->>'userId' FOR UPDATE;
  IF reg.user_id IS NULL OR actor.role='hr' AND reg.employment_type<>'intern' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Registration unavailable'); END IF;
  IF reg.activated_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  LOCK TABLE tbs_employees IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=reg.user_id) THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Employee already exists. Review their existing profile.'); END IF;
  SELECT COALESCE(max(tbs_id),0)+1,COALESCE(max(intern_number),0)+1 INTO n,tn FROM tbs_employees;
  INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,nickname,department,status,employment_type,intern_number)
  VALUES(reg.user_id,n,reg.first_name,reg.last_name,reg.nickname,reg.department,'active',reg.employment_type,CASE WHEN reg.employment_type='intern' THEN tn END);
  IF reg.employment_type='intern' THEN
   INSERT INTO tbs_intern_terms VALUES(reg.user_id,(payload->>'startDate')::date,(payload->>'endDate')::date,(payload->>'months')::integer);
  ELSE
   IF (payload->>'annualTotal')::numeric IS NULL OR (payload->>'annualTotal')::numeric<0 THEN RAISE EXCEPTION 'Annual allowance required'; END IF;
   INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES(reg.user_id,extract(year FROM now() AT TIME ZONE 'Asia/Bangkok')::integer,(payload->>'annualTotal')::numeric,30,3,0);
  END IF;
  UPDATE tbs_registrations SET activated_at=now() WHERE user_id=reg.user_id;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'registration-activate',reg.user_id);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF COALESCE(uid,'')='' THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','LINE sign in required'); END IF;
 PERFORM pg_advisory_xact_lock(hashtext(uid));
 SELECT * INTO employee FROM tbs_employees WHERE user_id=tbs_resolve_employee(uid);
 IF employee.user_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'found',employee.status='active','inactive',employee.status<>'active','name',concat_ws('|',employee.first_name,employee.last_name,employee.nickname),'department',employee.department); END IF;
 IF payload->>'action'='submit' THEN
  IF length(btrim(COALESCE(payload->>'firstName','')))=0 OR length(btrim(COALESCE(payload->>'lastName','')))=0 OR length(btrim(COALESCE(payload->>'department','')))=0 OR COALESCE(payload->>'employmentType','') NOT IN ('employee','intern') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Complete your name, department and employment type'); END IF;
  INSERT INTO tbs_registrations(user_id,first_name,last_name,nickname,department,employment_type) VALUES(uid,btrim(payload->>'firstName'),btrim(payload->>'lastName'),btrim(COALESCE(payload->>'nickname','')),payload->>'department',payload->>'employmentType') ON CONFLICT DO NOTHING;
 END IF;
 SELECT * INTO reg FROM tbs_registrations WHERE user_id=uid;
 RETURN jsonb_build_object('ok',true,'found',false,'pending',reg.user_id IS NOT NULL,'employmentType',reg.employment_type);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR datetime_field_overflow THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid activation details');
END $$;
COMMIT;
