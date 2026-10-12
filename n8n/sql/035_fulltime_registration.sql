BEGIN;
-- Full-time LINE registration is immediate. Individual annual allowances remain
-- unset until an administrator records the correct entitlement in the dashboard.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_registration(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'activated_at IS NULL AND (actor.role<>''hr'' OR employment_type=''intern'')','activated_at IS NULL AND employment_type=''intern''');
 def:=replace(def,'reg.user_id IS NULL OR actor.role=''hr'' AND reg.employment_type<>''intern''','reg.user_id IS NULL OR reg.employment_type<>''intern''');
 IF strpos(def,'-- Immediate full-time registration')=0 THEN
 def:=replace(def,'SELECT * INTO reg FROM tbs_registrations WHERE user_id=uid;', $patch$
 SELECT * INTO reg FROM tbs_registrations WHERE user_id=uid;
 -- Immediate full-time registration, including previously pending profiles.
 IF reg.user_id IS NOT NULL AND reg.employment_type='employee' AND reg.activated_at IS NULL THEN
  LOCK TABLE tbs_employees IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(tbs_id),0)+1 INTO n FROM tbs_employees;
  INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,nickname,department,status,employment_type)
  VALUES(uid,n,reg.first_name,reg.last_name,reg.nickname,reg.department,'active','employee');
  INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over)
  VALUES(uid,extract(year FROM now() AT TIME ZONE 'Asia/Bangkok')::integer,NULL,30,3,0)
  ON CONFLICT(user_id,year) DO NOTHING;
  UPDATE tbs_registrations SET activated_at=now() WHERE user_id=uid;
  RETURN jsonb_build_object('ok',true,'found',true,'pending',false,'name',concat_ws('|',reg.first_name,reg.last_name,reg.nickname),'department',reg.department);
 END IF;
 $patch$);
 END IF;
 EXECUTE def;
END $$;
COMMIT;
