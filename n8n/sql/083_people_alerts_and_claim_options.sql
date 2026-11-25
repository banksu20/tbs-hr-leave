BEGIN;
ALTER TABLE tbs_employees ADD COLUMN IF NOT EXISTS work_email text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='tbs_employees_work_email_check') THEN
  ALTER TABLE tbs_employees ADD CONSTRAINT tbs_employees_work_email_check CHECK(work_email IS NULL OR (length(work_email)<=200 AND work_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS tbs_people_alert_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 pc_email text CHECK(pc_email IS NULL OR (length(pc_email)<=200 AND pc_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
 sick_count integer NOT NULL DEFAULT 3 CHECK(sick_count BETWEEN 2 AND 20),
 sick_window_days integer NOT NULL DEFAULT 90 CHECK(sick_window_days BETWEEN 14 AND 365),
 lead_notice boolean NOT NULL DEFAULT false,
 lead_days_ahead integer NOT NULL DEFAULT 3 CHECK(lead_days_ahead BETWEEN 1 AND 14),
 last_run_date date,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
INSERT INTO tbs_people_alert_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_sick_pattern_log(
 id serial PRIMARY KEY,
 user_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 occasions integer NOT NULL,
 days numeric NOT NULL,
 sent_to text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tbs_sick_pattern_log_user ON tbs_sick_pattern_log(user_id,sent_at);
CREATE TABLE IF NOT EXISTS tbs_lead_leave_notices(
 request_id integer PRIMARY KEY REFERENCES leave_requests(id) ON DELETE CASCADE,
 lead_user_id text NOT NULL,
 sent_to text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tbs_travel_settings ADD COLUMN IF NOT EXISTS motorcycle_rate numeric(6,2) CHECK(motorcycle_rate IS NULL OR (motorcycle_rate>0 AND motorcycle_rate<=100));
ALTER TABLE tbs_trip_points ADD COLUMN IF NOT EXISTS manual_reason text CHECK(manual_reason IS NULL OR length(manual_reason) BETWEEN 5 AND 300);
DO $$ DECLARE c text; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='tbs_trips'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%mode%' LOOP
  EXECUTE format('ALTER TABLE tbs_trips DROP CONSTRAINT %I',c);
 END LOOP;
END $$;
ALTER TABLE tbs_trips ADD CONSTRAINT tbs_trips_mode_check CHECK(mode IN ('car','motorcycle','grab','taxi'));

CREATE OR REPLACE FUNCTION tbs_receipt_wrong_kind(mode text,r tbs_trip_receipts) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (r.read_kind IS NOT NULL AND r.read_kind<>'other' AND r.read_kind<>r.kind)
  OR (mode IN ('car','motorcycle') AND COALESCE(r.read_kind,r.kind) IN ('grab','taxi'))
  OR (mode='grab' AND COALESCE(r.read_kind,r.kind) IN ('taxi','parking'))
  OR (mode='taxi' AND COALESCE(r.read_kind,r.kind) IN ('grab','parking'));
$$;

CREATE OR REPLACE FUNCTION tbs_trip_flag_text(f text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE f
  WHEN 'gps_weak' THEN 'GPS อ่อน / Weak GPS'
  WHEN 'gps_manual' THEN 'เช็กอินโดยไม่มี GPS / Checked in without GPS'
  WHEN 'too_fast' THEN 'เร็วผิดปกติ / Too fast'
  WHEN 'over_cap' THEN 'ระยะทางเกินกำหนด / Over the km limit'
  WHEN 'far_from_client' THEN 'เช็กอินไกลจากลูกค้า / Checked in far from the client'
  WHEN 'fare_high' THEN 'ค่าโดยสารสูง / Fare looks high'
  WHEN 'no_checkin' THEN 'ไม่ได้เช็กอินที่ลูกค้า / No check-in at the client'
  WHEN 'receipt_not_receipt' THEN 'รูปไม่ใช่ใบเสร็จ / Photo is not a receipt'
  WHEN 'receipt_date' THEN 'ใบเสร็จคนละวัน / Receipt from another day'
  WHEN 'receipt_time' THEN 'เวลาใบเสร็จไม่ตรงทริป / Receipt time outside the trip'
  WHEN 'receipt_duplicate' THEN 'ใบเสร็จเคยใช้แล้ว / Receipt used before'
  WHEN 'receipt_kind' THEN 'ใบเสร็จไม่ตรงการเดินทาง / Receipt does not match the trip'
  ELSE f END;
$$;

DO $$ BEGIN
 IF to_regprocedure('tbs_trip_flags_before_manual(tbs_trips)') IS NULL THEN
  ALTER FUNCTION tbs_trip_flags(tbs_trips) RENAME TO tbs_trip_flags_before_manual;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_trip_flags(t tbs_trips) RETURNS text[] LANGUAGE sql STABLE AS $$
 SELECT tbs_trip_flags_before_manual(t)||CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_points p WHERE p.trip_id=t.id AND p.manual_reason IS NOT NULL) THEN ARRAY['gps_manual'] ELSE '{}'::text[] END;
$$;

CREATE OR REPLACE FUNCTION tbs_travel_state(uid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('ok',true,'eligible',tbs_travel_eligible(uid),
  'configured',s.office_lat IS NOT NULL AND s.office_lng IS NOT NULL,
  'settings',jsonb_build_object('officeLat',s.office_lat,'officeLng',s.office_lng,'radius',s.office_radius_m,'rate',s.car_rate,'motorcycleRate',s.motorcycle_rate,'homeCutoff',to_char(s.home_cutoff,'HH24:MI')),
  'trip',(SELECT tbs_trip_json(t,true) FROM tbs_trips t WHERE t.user_id=uid AND t.status='open'),
  'recent',(SELECT COALESCE(jsonb_agg(x.j ORDER BY x.id DESC),'[]'::jsonb) FROM (SELECT t.id,tbs_trip_json(t,false) j FROM tbs_trips t WHERE t.user_id=uid AND t.status NOT IN ('open','cancelled') ORDER BY t.id DESC LIMIT 10) x))
 FROM tbs_travel_settings s WHERE s.singleton;
$$;

DO $$
DECLARE d text;
 old_mode text:='COALESCE(payload->>''mode'','''') NOT IN (''car'',''grab'',''taxi'')';
 old_rate text:='appt,s.car_rate) RETURNING * INTO t;';
 old_amount text:='CASE WHEN t.mode=''car'' THEN round(';
 old_arrive text:='INSERT INTO tbs_trip_points(trip_id,kind,stop_id,lat,lng,accuracy_m) VALUES(t.id,''arrive'',st.id,(payload->>''lat'')::numeric,(payload->>''lng'')::numeric,NULLIF(payload->>''accuracy'','''')::numeric)';
 old_return text:='INSERT INTO tbs_trip_points(trip_id,kind,lat,lng,accuracy_m) VALUES(t.id,''return_office'',(payload->>''lat'')::numeric,(payload->>''lng'')::numeric,NULLIF(payload->>''accuracy'','''')::numeric)';
 reason text:='NULLIF(left(btrim(COALESCE(payload->>''manualReason'','''')),300),'''')';
 old_json text:='''accuracy'',p.accuracy_m,';
BEGIN
 d:=pg_get_functiondef('tbs_travel_employee(text,jsonb)'::regprocedure);
 IF position('motorcycle' IN d)=0 THEN
  IF position(old_mode IN d)=0 OR position(old_rate IN d)=0 OR position(old_amount IN d)=0 OR position(old_arrive IN d)=0 OR position(old_return IN d)=0 THEN
   RAISE EXCEPTION 'tbs_travel_employee changed; motorcycle and manual check-in patch not applied';
  END IF;
  d:=replace(d,old_mode,'COALESCE(payload->>''mode'','''') NOT IN (''car'',''motorcycle'',''grab'',''taxi'') OR (payload->>''mode''=''motorcycle'' AND s.motorcycle_rate IS NULL)');
  d:=replace(d,old_rate,'appt,CASE WHEN payload->>''mode''=''motorcycle'' THEN s.motorcycle_rate ELSE s.car_rate END) RETURNING * INTO t;');
  d:=replace(d,old_amount,'CASE WHEN t.mode IN (''car'',''motorcycle'') THEN round(');
  d:=replace(d,old_arrive,replace(replace(old_arrive,'accuracy_m)','accuracy_m,manual_reason)'),'NULLIF(payload->>''accuracy'','''')::numeric)','NULLIF(payload->>''accuracy'','''')::numeric,'||reason||')'));
  d:=replace(d,old_return,replace(replace(old_return,'accuracy_m)','accuracy_m,manual_reason)'),'NULLIF(payload->>''accuracy'','''')::numeric)','NULLIF(payload->>''accuracy'','''')::numeric,'||reason||')'));
  EXECUTE d;
 END IF;
 d:=pg_get_functiondef('tbs_trip_json(tbs_trips,boolean)'::regprocedure);
 IF position('manualReason' IN d)=0 THEN
  IF position(old_json IN d)=0 THEN RAISE EXCEPTION 'tbs_trip_json points changed; manual check-in patch not applied'; END IF;
  d:=replace(d,old_json,old_json||'''manualReason'',p.manual_reason,');
  EXECUTE d;
 END IF;
 d:=pg_get_functiondef('tbs_trip_accountant_card(tbs_trips)'::regprocedure);
 IF position('motorcycle' IN d)=0 THEN
  IF position('WHEN ''grab'' THEN ''Grab'' ELSE' IN d)=0 OR position('CASE WHEN t.mode=''car'' THEN '' · ''' IN d)=0 THEN RAISE EXCEPTION 'tbs_trip_accountant_card changed; motorcycle patch not applied'; END IF;
  d:=replace(d,'WHEN ''grab'' THEN ''Grab'' ELSE','WHEN ''motorcycle'' THEN ''มอเตอร์ไซค์ / Motorcycle'' WHEN ''grab'' THEN ''Grab'' ELSE');
  d:=replace(d,'CASE WHEN t.mode=''car'' THEN '' · ''','CASE WHEN t.mode IN (''car'',''motorcycle'') THEN '' · ''');
  EXECUTE d;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION tbs_people_name(e tbs_employees) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(concat_ws(' ',NULLIF(e.first_name,''),NULLIF(e.last_name,'')),''),'—')||CASE WHEN COALESCE(e.nickname,'')<>'' THEN ' ('||e.nickname||')' ELSE '' END;
$$;
CREATE OR REPLACE FUNCTION tbs_leave_type_text(kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE lower(COALESCE(kind,'')) WHEN 'sick' THEN 'ลาป่วย / Sick' WHEN 'annual' THEN 'ลาพักร้อน / Annual' WHEN 'vacation' THEN 'ลาพักร้อน / Annual'
  WHEN 'personal' THEN 'ลากิจ / Personal' WHEN 'university' THEN 'ลาไปมหาวิทยาลัย / University' ELSE COALESCE(kind,'') END;
$$;
CREATE OR REPLACE FUNCTION tbs_leave_date_text(r leave_requests) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN r.end_date IS NULL OR r.end_date::date=r.start_date::date THEN to_char(r.start_date::date,'DD Mon YYYY')
  ELSE to_char(r.start_date::date,'DD Mon')||' – '||to_char(r.end_date::date,'DD Mon YYYY') END;
$$;

CREATE OR REPLACE FUNCTION tbs_sick_pattern_alerts(today date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE s tbs_people_alert_settings%ROWTYPE; x record; n integer:=0; rows text:=''; first_uid text; BEGIN
 SELECT * INTO s FROM tbs_people_alert_settings WHERE singleton;
 IF s.pc_email IS NULL THEN RETURN 0; END IF;
 FOR x IN SELECT e.*,c.occasions,c.days,c.dates FROM tbs_employees e JOIN LATERAL(
   SELECT count(*)::int occasions,COALESCE(sum(r.leave_days),0) days,string_agg(tbs_leave_date_text(r),', ' ORDER BY r.start_date) dates
   FROM leave_requests r WHERE r.user_id=e.user_id AND lower(COALESCE(r.leave_type,''))='sick' AND lower(COALESCE(r.status,''))='approved'
    AND r.start_date::date>today-s.sick_window_days AND r.start_date::date<=today) c ON true
  WHERE COALESCE(e.status,'active')='active' AND c.occasions>=s.sick_count
   AND NOT EXISTS(SELECT 1 FROM tbs_sick_pattern_log a WHERE a.user_id=e.user_id AND a.sent_at>now()-make_interval(days=>s.sick_window_days))
  ORDER BY e.first_name LOOP
  INSERT INTO tbs_sick_pattern_log(user_id,occasions,days,sent_to) VALUES(x.user_id,x.occasions,x.days,s.pc_email);
  first_uid:=COALESCE(first_uid,x.user_id);
  n:=n+1;
  rows:=rows||'<tr><td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-weight:bold">'||tbs_html(tbs_people_name((SELECT e FROM tbs_employees e WHERE e.user_id=x.user_id)))||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0">'||tbs_html(COALESCE(x.department,''))||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right">'||x.occasions||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right">'||trim_scale(x.days)||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;color:#475569">'||tbs_html(x.dates)||'</td></tr>';
 END LOOP;
 IF n=0 THEN RETURN 0; END IF;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('email',first_uid,jsonb_build_object('to',s.pc_email,
  'subject','ลาป่วยบ่อย / Frequent sick leave: '||n||CASE WHEN n=1 THEN ' person' ELSE ' people' END,
  'html','<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:760px;margin:0 auto;padding:16px">'
   ||'<h2 style="margin:0 0 4px">ลาป่วยบ่อยกว่าปกติ / Frequent sick leave</h2>'
   ||'<p style="margin:0 0 16px;color:#64748b">'||s.sick_count||'+ ครั้งใน '||s.sick_window_days||' วัน / '||s.sick_count||'+ times in '||s.sick_window_days||' days</p>'
   ||'<table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:#f1f5f9;text-align:left"><th style="padding:8px">พนักงาน / Employee</th><th style="padding:8px">ทีม / Team</th><th style="padding:8px;text-align:right">ครั้ง / Times</th><th style="padding:8px;text-align:right">วัน / Days</th><th style="padding:8px">วันที่ / Dates</th></tr>'
   ||rows||'</table>'
   ||'<p style="margin-top:16px;padding:12px;border-radius:8px;background:#ecfeff;color:#155e75;font-size:13px">นี่คือสัญญาณให้เข้าไปคุยและดูแล ไม่ใช่คะแนนผลงาน อีเมลนี้ส่งถึงหัวหน้า People &amp; Culture เท่านั้น<br>This is a prompt to check in and offer support, not a performance score. Only the Head of People &amp; Culture gets this email.</p></div>'));
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION tbs_lead_leave_alerts(today date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE s tbs_people_alert_settings%ROWTYPE; l record; x record; rows text; n integer:=0; BEGIN
 SELECT * INTO s FROM tbs_people_alert_settings WHERE singleton;
 IF NOT s.lead_notice THEN RETURN 0; END IF;
 FOR l IN SELECT m.user_id,m.work_email,m.first_name,m.nickname FROM tbs_employees m
  WHERE COALESCE(m.status,'active')='active' AND m.work_email IS NOT NULL
   AND EXISTS(SELECT 1 FROM tbs_employees e JOIN leave_requests r ON r.user_id=e.user_id
    WHERE e.manager_user_id=m.user_id AND COALESCE(e.status,'active')='active' AND lower(COALESCE(r.status,''))='approved'
     AND r.start_date::date>today AND r.start_date::date<=today+s.lead_days_ahead AND NOT EXISTS(SELECT 1 FROM tbs_lead_leave_notices k WHERE k.request_id=r.id))
  ORDER BY m.first_name LOOP
  rows:='';
  FOR x IN SELECT r.*,e.department dept,tbs_people_name(e) who FROM tbs_employees e JOIN leave_requests r ON r.user_id=e.user_id
   WHERE e.manager_user_id=l.user_id AND COALESCE(e.status,'active')='active' AND lower(COALESCE(r.status,''))='approved'
    AND r.start_date::date>today AND r.start_date::date<=today+s.lead_days_ahead AND NOT EXISTS(SELECT 1 FROM tbs_lead_leave_notices k WHERE k.request_id=r.id)
   ORDER BY r.start_date,e.first_name LOOP
   INSERT INTO tbs_lead_leave_notices(request_id,lead_user_id,sent_to) VALUES(x.id,l.user_id,l.work_email);
   rows:=rows||'<tr><td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-weight:bold">'||tbs_html(x.who)||'</td>'
    ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0">'||tbs_html(tbs_leave_type_text(x.leave_type))||'</td>'
    ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0">'||tbs_html(tbs_leave_date_text((SELECT r FROM leave_requests r WHERE r.id=x.id)))||'</td>'
    ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right">'||trim_scale(COALESCE(x.leave_days,0))||'</td></tr>';
  END LOOP;
  INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('email',l.user_id,jsonb_build_object('to',l.work_email,
   'subject','ทีมของคุณจะลา / Upcoming leave in your team',
   'html','<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:680px;margin:0 auto;padding:16px">'
    ||'<h2 style="margin:0 0 4px">ทีมของคุณจะลาเร็ว ๆ นี้ / Upcoming leave in your team</h2>'
    ||'<p style="margin:0 0 16px;color:#64748b">สวัสดี '||tbs_html(COALESCE(NULLIF(l.nickname,''),l.first_name))||' วางแผนโยกงานและลูกค้าที่ต้องดูแลแทนล่วงหน้า / Please plan cover for their work and clients.</p>'
    ||'<table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:#f1f5f9;text-align:left"><th style="padding:8px">พนักงาน / Employee</th><th style="padding:8px">ประเภท / Type</th><th style="padding:8px">วันที่ / Dates</th><th style="padding:8px;text-align:right">วัน / Days</th></tr>'
    ||rows||'</table></div>'));
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION tbs_people_daily(force boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s tbs_people_alert_settings%ROWTYPE; today date:=(now() AT TIME ZONE 'Asia/Bangkok')::date; sick integer; leads integer; BEGIN
 SELECT * INTO s FROM tbs_people_alert_settings WHERE singleton FOR UPDATE;
 IF NOT force AND (s.last_run_date>=today OR (now() AT TIME ZONE 'Asia/Bangkok')::time<'07:00') THEN RETURN jsonb_build_object('sick',0,'leads',0); END IF;
 UPDATE tbs_people_alert_settings SET last_run_date=today WHERE singleton;
 sick:=tbs_sick_pattern_alerts(today);
 leads:=tbs_lead_leave_alerts(today);
 RETURN jsonb_build_object('sick',sick,'leads',leads);
END $$;

DO $$ BEGIN
 IF to_regprocedure('tbs_claim_line_batch_before_people_alerts(text)') IS NULL THEN
  ALTER FUNCTION tbs_claim_line_batch(text) RENAME TO tbs_claim_line_batch_before_people_alerts;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_claim_line_batch(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
BEGIN
 IF channel IN ('line','email') AND pg_try_advisory_xact_lock(hashtext('tbs_people_daily')) THEN
  BEGIN
   PERFORM tbs_people_daily();
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'People alerts skipped: %',SQLERRM;
  END;
 END IF;
 RETURN QUERY SELECT * FROM tbs_claim_line_batch_before_people_alerts(channel);
END $$;

CREATE OR REPLACE FUNCTION tbs_people_alert_json() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('pcEmail',s.pc_email,'sickCount',s.sick_count,'sickWindowDays',s.sick_window_days,'leadNotice',s.lead_notice,'leadDaysAhead',s.lead_days_ahead,
  'leadsWithEmail',(SELECT count(DISTINCT m.user_id) FROM tbs_employees m JOIN tbs_employees e ON e.manager_user_id=m.user_id AND COALESCE(e.status,'active')='active' WHERE COALESCE(m.status,'active')='active' AND m.work_email IS NOT NULL),
  'leads',(SELECT count(DISTINCT m.user_id) FROM tbs_employees m JOIN tbs_employees e ON e.manager_user_id=m.user_id AND COALESCE(e.status,'active')='active' WHERE COALESCE(m.status,'active')='active'))
 FROM tbs_people_alert_settings s WHERE s.singleton;
$$;

DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_people_alerts(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_people_alerts;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; b jsonb:=COALESCE(payload->'body','{}'::jsonb); r jsonb; mail text; rate numeric; BEGIN
 IF op NOT IN ('hr-people','hr-people-save','people-alerts','people-alerts-save','travel-settings','travel-settings-save') THEN RETURN tbs_dashboard_auth_before_people_alerts(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF actor.role='accounting' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Accounting can only open travel claims.'); END IF;
 IF op='people-alerts' THEN RETURN jsonb_build_object('ok',true,'alerts',tbs_people_alert_json()); END IF;
 IF op='people-alerts-save' THEN
  IF actor.role NOT IN ('admin','ceo','hr') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Operation not permitted'); END IF;
  mail:=NULLIF(lower(btrim(COALESCE(b->>'pcEmail',''))),'');
  IF mail IS NOT NULL AND (length(mail)>200 OR mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the email address.'); END IF;
  IF COALESCE(b->>'sickCount','')!~'^[0-9]{1,2}$' OR (b->>'sickCount')::int NOT BETWEEN 2 AND 20 OR COALESCE(b->>'sickWindowDays','')!~'^[0-9]{1,3}$' OR (b->>'sickWindowDays')::int NOT BETWEEN 14 AND 365
   OR jsonb_typeof(b->'leadNotice') IS DISTINCT FROM 'boolean' OR COALESCE(b->>'leadDaysAhead','')!~'^[0-9]{1,2}$' OR (b->>'leadDaysAhead')::int NOT BETWEEN 1 AND 14 THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the alert settings.');
  END IF;
  UPDATE tbs_people_alert_settings SET pc_email=mail,sick_count=(b->>'sickCount')::int,sick_window_days=(b->>'sickWindowDays')::int,lead_notice=(b->>'leadNotice')::boolean,
   lead_days_ahead=(b->>'leadDaysAhead')::int,updated_at=now(),updated_by=actor.username WHERE singleton;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'people-alerts-save',NULL);
  RETURN jsonb_build_object('ok',true,'alerts',tbs_people_alert_json());
 END IF;
 IF op='hr-people-save' AND (b ? 'workEmail') THEN
  mail:=NULLIF(lower(btrim(COALESCE(b->>'workEmail',''))),'');
  IF mail IS NOT NULL AND (length(mail)>200 OR mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the work email.'); END IF;
 END IF;
 IF op='travel-settings-save' AND (b ? 'motorcycleRate') AND jsonb_typeof(b->'motorcycleRate')<>'null' THEN
  IF jsonb_typeof(b->'motorcycleRate')<>'number' OR (b->>'motorcycleRate')::numeric<=0 OR (b->>'motorcycleRate')::numeric>100 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the motorcycle rate.'); END IF;
 END IF;
 r:=tbs_dashboard_auth_before_people_alerts(payload);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RETURN r; END IF;
 IF op='hr-people-save' AND (b ? 'workEmail') THEN
  UPDATE tbs_employees SET work_email=mail WHERE user_id=b->>'userId';
 END IF;
 IF op='travel-settings-save' AND (b ? 'motorcycleRate') THEN
  rate:=CASE WHEN jsonb_typeof(b->'motorcycleRate')='number' THEN round((b->>'motorcycleRate')::numeric,2) END;
  UPDATE tbs_travel_settings SET motorcycle_rate=rate WHERE singleton;
 END IF;
 IF op IN ('hr-people','hr-people-save') AND jsonb_typeof(r->'people')='array' THEN
  r:=jsonb_set(r,'{people}',(SELECT COALESCE(jsonb_agg(p||jsonb_build_object('workEmail',e.work_email) ORDER BY o),'[]'::jsonb)
   FROM jsonb_array_elements(r->'people') WITH ORDINALITY x(p,o) LEFT JOIN tbs_employees e ON e.user_id=p->>'id'));
 END IF;
 IF op IN ('travel-settings','travel-settings-save') AND jsonb_typeof(r->'settings')='object' THEN
  r:=jsonb_set(r,'{settings,motorcycleRate}',COALESCE(to_jsonb((SELECT motorcycle_rate FROM tbs_travel_settings WHERE singleton)),'null'::jsonb));
 END IF;
 RETURN r;
END $$;
COMMIT;
