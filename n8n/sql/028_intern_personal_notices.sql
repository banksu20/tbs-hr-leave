BEGIN;
CREATE OR REPLACE FUNCTION tbs_personal_period_year(uid text,as_of date) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN e.employment_type='intern' THEN extract(year FROM t.start_date)::int ELSE extract(year FROM as_of)::int END FROM tbs_employees e LEFT JOIN tbs_intern_terms t USING(user_id) WHERE e.user_id=tbs_resolve_employee(uid);
$$;
CREATE OR REPLACE FUNCTION tbs_personal_used(uid text,as_of date) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT COALESCE(sum(r.leave_days/cardinality(ds.dates)),0) FROM leave_requests r JOIN tbs_employees e USING(user_id) LEFT JOIN tbs_intern_terms t USING(user_id)
 CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) dates) ds CROSS JOIN LATERAL unnest(ds.dates) d
 WHERE r.user_id=tbs_resolve_employee(uid) AND r.leave_type='personal' AND r.status='Approved' AND d<=as_of AND CASE WHEN e.employment_type='intern' THEN d BETWEEN t.start_date AND t.end_date ELSE extract(year FROM d)=extract(year FROM as_of) END;
$$;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_run_personal_daily(timestamptz)'::regprocedure) INTO def;
 def:=replace(def,'WHERE employment_type=''employee'' AND COALESCE(status','WHERE (employment_type=''employee'' OR EXISTS(SELECT 1 FROM tbs_intern_terms t WHERE t.user_id=tbs_employees.user_id AND local_now::date BETWEEN t.start_date AND t.end_date)) AND COALESCE(status');
 def:=replace(def,'extract(year FROM local_now)::int','tbs_personal_period_year(e.user_id,local_now::date)');
 def:=replace(def,'year=extract(year FROM local_now)','year=tbs_personal_period_year(e.user_id,local_now::date)');EXECUTE def;
 SELECT pg_get_functiondef('tbs_refresh_sick_jobs()'::regprocedure) INTO def;
 def:=replace(def,'a.year<>extract(year FROM today)','a.year IS DISTINCT FROM tbs_personal_period_year(a.user_id,today)');
 def:=replace(def,'user_id=a.user_id AND employment_type=''employee'' AND COALESCE(status','user_id=a.user_id AND (employment_type=''employee'' OR EXISTS(SELECT 1 FROM tbs_intern_terms t WHERE t.user_id=a.user_id AND today BETWEEN t.start_date AND t.end_date)) AND COALESCE(status');EXECUTE def;
 SELECT pg_get_functiondef('tbs_personal_card(text,integer,uuid,uuid,date)'::regprocedure) INTO def;
 def:=replace(def,''' จาก 3 วัน ในปี ''||yr',''' จาก 3 วัน ''||CASE WHEN e.employment_type=''intern'' THEN ''ตลอดการฝึกงาน'' ELSE ''ในปี ''||yr END');
 def:=replace(def,''' of 3 personal leave days in ''||yr||''.''',''' of 3 personal leave days ''||CASE WHEN e.employment_type=''intern'' THEN ''during your internship.'' ELSE ''in ''||yr||''.'' END');EXECUTE def;
 SELECT pg_get_functiondef('tbs_sick_acknowledge(text,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'least(today,make_date(a.year,12,31))','CASE WHEN e.employment_type=''intern'' THEN today ELSE least(today,make_date(a.year,12,31)) END');EXECUTE def;
END $$;
COMMIT;
