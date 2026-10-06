-- Apply through n8n PostgreSQL after 015. Installation sends no messages.
BEGIN;
CREATE TABLE IF NOT EXISTS tbs_sick_notification_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz
);
INSERT INTO tbs_sick_notification_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_sick_milestones (
 user_id text NOT NULL REFERENCES tbs_employees(user_id), year integer NOT NULL,
 threshold integer NOT NULL CHECK(threshold IN (5,10,20,25,30)),
 audience text NOT NULL CHECK(audience IN ('employee','ceo')),
 total numeric NOT NULL, baseline boolean NOT NULL DEFAULT false, job_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,year,threshold,audience)
);
CREATE OR REPLACE FUNCTION tbs_sick_used(uid text, as_of date)
RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT round(COALESCE(sum(r.leave_days/NULLIF(cardinality(ds.dates),0)),0),4)
 FROM leave_requests r
 CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) dates) ds
 CROSS JOIN LATERAL unnest(ds.dates) d
 WHERE r.user_id=tbs_resolve_employee(uid) AND r.status='Approved'
 AND lower(trim(r.leave_type)) IN ('sick','sick leave','ลาป่วย')
 AND d BETWEEN date_trunc('year',as_of)::date AND as_of;
$$;
CREATE OR REPLACE FUNCTION tbs_sick_flex(employee jsonb, total numeric, milestone integer, yr integer, boss boolean, as_of date DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date, lang text DEFAULT 'en')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE title text; advice text; summary text; detail text; color text:='#B91C1C'; thai boolean:=lang='th' AND NOT boss;
BEGIN
 title:='⚠ '||CASE WHEN boss THEN 'HR FOLLOW-UP REQUIRED'
 WHEN milestone>=30 THEN 'PAID SICK LEAVE ALLOWANCE EXHAUSTED'
 WHEN milestone>=25 THEN 'ONLY '||trim_scale(greatest(30-total,0))||' PAID SICK DAYS REMAINING'
 WHEN milestone>=20 THEN trim_scale(total)||' SICK DAYS USED'
 WHEN milestone>=10 THEN 'SICK LEAVE REVIEW' ELSE 'SICK LEAVE REMINDER' END;
 IF boss THEN
 advice:=CASE WHEN milestone>=30 THEN 'The 30-day paid sick leave allowance has been reached. Please contact the employee about the next steps under company policy.'
 ELSE 'The 10-day sick leave threshold has been reached. Please arrange a supportive check-in with the employee if appropriate.' END;
 ELSE
 advice:=CASE WHEN milestone>=30 THEN 'You have used all of your paid sick leave allowance. Further sick leave follows company policy. Please contact HR.'
 WHEN milestone>=25 THEN 'If you would like advice on health benefits, please contact HR.'
 WHEN milestone>=10 THEN 'Please take care of your health. If your symptoms continue, we recommend getting a health check-up.'
 ELSE 'Please take care of your health.' END;
 END IF;
 summary:=trim_scale(total)||' days · '||yr;
 detail:='Paid sick leave remaining: '||trim_scale(greatest(30-total,0))||' / 30 days';
 IF thai THEN
 title:='⚠ '||CASE WHEN milestone>=30 THEN 'ใช้สิทธิ์ลาป่วยแบบได้รับค่าจ้างครบแล้ว'
 WHEN milestone>=25 THEN 'เหลือสิทธิ์ลาป่วยแบบได้รับค่าจ้าง '||trim_scale(greatest(30-total,0))||' วัน'
 WHEN milestone>=20 THEN 'ใช้วันลาป่วยแล้ว '||trim_scale(total)||' วัน'
 WHEN milestone>=10 THEN 'แจ้งทบทวนยอดวันลาป่วย' ELSE 'แจ้งเตือนยอดวันลาป่วย' END;
 advice:=CASE WHEN milestone>=30 THEN 'ใช้สิทธิ์ลาป่วยแบบได้รับค่าจ้างครบแล้ว การลาป่วยเพิ่มเติมเป็นไปตามนโยบายบริษัท กรุณาติดต่อ HR'
 WHEN milestone>=25 THEN 'หากต้องการคำแนะนำเกี่ยวกับสิทธิประโยชน์ด้านสุขภาพ กรุณาติดต่อ HR'
 WHEN milestone>=10 THEN 'โปรดดูแลสุขภาพ หากยังมีอาการต่อเนื่อง แนะนำให้เข้ารับการตรวจสุขภาพ'
 ELSE 'โปรดดูแลสุขภาพและพักผ่อนให้เพียงพอ' END;
 summary:=trim_scale(total)||' วัน · ปี '||yr;
 detail:='สิทธิ์ลาป่วยแบบได้รับค่าจ้างคงเหลือ '||trim_scale(greatest(30-total,0))||' / 30 วัน';
 END IF;
 RETURN jsonb_build_object('type','flex','altText',left(title||': '||summary,300),'contents',jsonb_build_object('type','bubble','body',jsonb_build_object(
 'type','box','layout','vertical','spacing','md','paddingAll','20px','contents',jsonb_build_array(
 jsonb_build_object('type','box','layout','vertical','backgroundColor',color,'cornerRadius','8px','paddingAll','12px','contents',jsonb_build_array(jsonb_build_object('type','text','text',title,'weight','bold','size','sm','color','#FFFFFF','wrap',true))),
 jsonb_build_object('type','text','text',left(COALESCE(NULLIF(employee->>'name',''),'Employee'),150),'weight','bold','size','lg','wrap',true),
 jsonb_build_object('type','text','text',CASE WHEN boss THEN 'TBS-'||lpad(COALESCE(employee->>'code','?'),3,'0')||' · '||COALESCE(NULLIF(employee->>'department',''),'Unassigned') ELSE CASE WHEN thai THEN 'วันลาป่วยที่อนุมัติ' ELSE 'Approved sick leave' END END,'size','xs','color','#64748B','wrap',true),
 jsonb_build_object('type','box','layout','vertical','spacing','sm','backgroundColor','#FEF2F2','cornerRadius','12px','paddingAll','16px','contents',jsonb_build_array(
 jsonb_build_object('type','text','text',summary,'weight','bold','size','xxl','color',color,'wrap',true),
 jsonb_build_object('type','text','text',detail,'size','sm','wrap',true))),
 jsonb_build_object('type','text','text',advice,'size','sm','color','#475569','wrap',true),
 jsonb_build_object('type','text','text',CASE WHEN thai THEN 'นับวันลาที่อนุมัติถึง ' ELSE 'Approved leave through ' END||to_char(as_of,'DD Mon YYYY'),'size','xs','color','#64748B','wrap',true)
 ))));
END $$;
CREATE TABLE IF NOT EXISTS tbs_sick_language (user_id text PRIMARY KEY REFERENCES tbs_employees(user_id), language text NOT NULL CHECK(language IN ('en','th')));
CREATE OR REPLACE FUNCTION tbs_check_sick_employee(uid text, as_of date DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date, baseline_only boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE e tbs_employees%ROWTYPE; used numeric; yr integer:=extract(year FROM as_of); audience_name text; levels integer[]; t integer; added integer; job uuid; recipient text; boss text; lang text; queued integer:=0;
BEGIN
 IF NOT baseline_only AND NOT EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE enabled) THEN RETURN 0; END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=tbs_resolve_employee(uid) AND COALESCE(status,'active')='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 used:=tbs_sick_used(e.user_id,as_of);
 SELECT ceo_account_id INTO boss FROM tbs_cancellation_line_settings WHERE singleton;
 SELECT language INTO lang FROM tbs_sick_language WHERE user_id=e.user_id;
 FOREACH audience_name IN ARRAY ARRAY['employee','ceo'] LOOP
  levels:='{}';
  FOREACH t IN ARRAY CASE WHEN audience_name='ceo' THEN ARRAY[10,30] ELSE ARRAY[5,10,20,25,30] END LOOP
   IF used>=t THEN
    INSERT INTO tbs_sick_milestones(user_id,year,threshold,audience,total,baseline) VALUES(e.user_id,yr,t,audience_name,used,baseline_only) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS added=ROW_COUNT;
    IF added>0 THEN levels:=array_append(levels,t); END IF;
   END IF;
  END LOOP;
  IF cardinality(levels)>0 AND NOT baseline_only THEN
   recipient:=CASE WHEN audience_name='ceo' THEN boss ELSE e.user_id END;
   IF recipient IS NULL OR recipient='' THEN RAISE EXCEPTION 'Sick notification recipient is missing'; END IF;
   INSERT INTO tbs_sync_jobs(kind,user_id,year,payload) VALUES('line',e.user_id,yr,jsonb_build_object('to',recipient,'messages',jsonb_build_array(tbs_sick_flex(
    jsonb_build_object('name',concat_ws(' ',e.first_name,e.last_name),'code',e.tbs_id,'department',e.department),used,levels[cardinality(levels)],yr,audience_name='ceo',as_of,COALESCE(lang,'en'))))) RETURNING id INTO job;
   UPDATE tbs_sick_milestones SET job_id=job WHERE user_id=e.user_id AND year=yr AND audience=audience_name AND threshold=ANY(levels);
   queued:=queued+1;
  END IF;
 END LOOP;
 RETURN queued;
END $$;
CREATE OR REPLACE FUNCTION tbs_check_sick_daily(as_of date DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE e record; queued integer:=0;
BEGIN
 FOR e IN SELECT user_id FROM tbs_employees WHERE COALESCE(status,'active')='active' AND NOT EXISTS(SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=tbs_employees.user_id) ORDER BY user_id LOOP
 queued:=queued+tbs_check_sick_employee(e.user_id,as_of); END LOOP;
 RETURN queued;
END $$;
CREATE OR REPLACE FUNCTION tbs_sick_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'DELETE' AND lower(trim(NEW.leave_type)) IN ('sick','sick leave','ลาป่วย') THEN PERFORM tbs_check_sick_employee(NEW.user_id); END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS zz_tbs_sick_notification ON leave_requests;
CREATE TRIGGER zz_tbs_sick_notification AFTER INSERT OR UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_sick_changed();
-- Activation is explicit: baseline existing totals without sending historical reminders.
CREATE OR REPLACE FUNCTION tbs_activate_sick_notifications() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE e record; count_employees integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_cancellation_line_settings WHERE singleton AND ceo_account_id ~ '^U[0-9a-f]{32}$') THEN RAISE EXCEPTION 'Configure a valid CEO LINE recipient before activation'; END IF;
 LOCK TABLE leave_requests IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM tbs_sick_notification_settings WHERE singleton FOR UPDATE;
 IF EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE activated_at IS NOT NULL) THEN
 UPDATE tbs_sick_notification_settings SET enabled=true WHERE singleton; RETURN 0; END IF;
 FOR e IN SELECT user_id FROM tbs_employees WHERE COALESCE(status,'active')='active' AND NOT EXISTS(SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=tbs_employees.user_id) ORDER BY user_id LOOP
 PERFORM tbs_check_sick_employee(e.user_id,(now() AT TIME ZONE 'Asia/Bangkok')::date,true); count_employees:=count_employees+1;
 END LOOP;
 UPDATE tbs_sick_notification_settings SET enabled=true,activated_at=now() WHERE singleton;
 PERFORM set_config('app.tbs_action','paid_sick_policy_30',true);
 UPDATE leave_quotas q SET sick_total=30 WHERE year>=2026 AND sick_total IS DISTINCT FROM 30 AND NOT EXISTS(SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=q.user_id);
 RETURN count_employees;
END $$;
ALTER TABLE tbs_sick_notification_settings ADD COLUMN IF NOT EXISTS last_daily_date date;
CREATE OR REPLACE FUNCTION tbs_run_sick_daily(run_at timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE local_now timestamp:=run_at AT TIME ZONE 'Asia/Bangkok'; result integer;
BEGIN
 PERFORM 1 FROM tbs_sick_notification_settings WHERE singleton FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE enabled AND (last_daily_date IS NULL OR last_daily_date<local_now::date)) OR local_now::time<time '08:30' THEN RETURN 0; END IF;
 result:=tbs_check_sick_daily(local_now::date);
 UPDATE tbs_sick_notification_settings SET last_daily_date=local_now::date WHERE singleton;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION tbs_paid_sick_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.year>=2026 AND EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE activated_at IS NOT NULL) THEN NEW.sick_total:=30; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_paid_sick_policy ON leave_quotas;
CREATE TRIGGER tbs_paid_sick_policy BEFORE INSERT OR UPDATE ON leave_quotas FOR EACH ROW EXECUTE FUNCTION tbs_paid_sick_policy();
CREATE OR REPLACE FUNCTION tbs_set_sick_language(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId');
BEGIN
 IF payload->>'language' IS NULL OR payload->>'language' NOT IN ('en','th') OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid employee or language'); END IF;
 INSERT INTO tbs_sick_language(user_id,language) VALUES(uid,payload->>'language') ON CONFLICT(user_id) DO UPDATE SET language=EXCLUDED.language;
 RETURN jsonb_build_object('ok',true);
END $$;
COMMIT;
