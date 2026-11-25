BEGIN;
ALTER TABLE tbs_attendance_people ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'part-time';
ALTER TABLE tbs_attendance_people ADD COLUMN IF NOT EXISTS wfh_days integer[] NOT NULL DEFAULT '{}';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='tbs_attendance_people_kind') THEN
  ALTER TABLE tbs_attendance_people ADD CONSTRAINT tbs_attendance_people_kind CHECK(kind IN ('part-time','wfh') AND wfh_days<@ARRAY[1,2,3,4,5,6,7]);
 END IF;
END $$;
ALTER TABLE tbs_attendance_settings ADD COLUMN IF NOT EXISTS wfh_work_minutes integer NOT NULL DEFAULT 480 CHECK(wfh_work_minutes BETWEEN 60 AND 720);

CREATE OR REPLACE FUNCTION tbs_attendance_kind(uid text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT kind FROM tbs_attendance_people WHERE user_id=uid),'part-time');
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_wfh_days(uid text) RETURNS integer[] LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT ARRAY(SELECT DISTINCT d FROM unnest(wfh_days) d ORDER BY d) FROM tbs_attendance_people WHERE user_id=uid),'{}');
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_target(uid text) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN tbs_attendance_kind(uid)='wfh' THEN s.wfh_work_minutes ELSE s.work_minutes END FROM tbs_attendance_settings s WHERE s.singleton;
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_workday(uid text,d date) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT tbs_attendance_kind(uid)<>'wfh' OR extract(isodow FROM d)::integer=ANY(tbs_attendance_wfh_days(uid));
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_shift_json(x tbs_attendance_shifts,with_location boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',x.id,'date',x.work_date,'in',x.in_at,'out',x.out_at,'missedOut',x.missed_out,'edited',x.edited,
  'workedMin',tbs_attendance_worked(x.in_at,x.out_at),
  'overtimeMin',greatest(0,tbs_attendance_worked(x.in_at,x.out_at)-tbs_attendance_target(x.user_id)))
 ||CASE WHEN with_location THEN jsonb_build_object('inLat',x.in_lat,'inLng',x.in_lng,'inAccuracy',x.in_accuracy_m,'outLat',x.out_lat,'outLng',x.out_lng,'outAccuracy',x.out_accuracy_m) ELSE '{}'::jsonb END;
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_state(uid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('ok',true,'enabled',s.enabled,'member',tbs_attendance_member(uid),'eligible',s.enabled AND tbs_attendance_member(uid),
  'kind',tbs_attendance_kind(uid),'wfhDays',to_jsonb(tbs_attendance_wfh_days(uid)),'workToday',tbs_attendance_workday(uid,tbs_bkk_today()),
  'settings',jsonb_build_object('workMinutes',tbs_attendance_target(uid),'breakMinutes',s.break_minutes,'breakAfterMinutes',s.break_after_minutes,'locationDays',s.location_days),
  'today',tbs_bkk_today(),
  'open',(SELECT tbs_attendance_shift_json(x,true) FROM tbs_attendance_shifts x WHERE x.user_id=uid AND x.out_at IS NULL AND NOT x.missed_out ORDER BY x.id DESC LIMIT 1),
  'shifts',(SELECT COALESCE(jsonb_agg(tbs_attendance_shift_json(x,true) ORDER BY x.in_at DESC),'[]'::jsonb) FROM tbs_attendance_shifts x WHERE x.user_id=uid AND x.work_date>=tbs_bkk_today()-40),
  'weekMin',(SELECT COALESCE(sum(tbs_attendance_worked(x.in_at,x.out_at)),0) FROM tbs_attendance_shifts x WHERE x.user_id=uid AND x.work_date>=date_trunc('week',tbs_bkk_today())::date),
  'monthMin',(SELECT COALESCE(sum(tbs_attendance_worked(x.in_at,x.out_at)),0) FROM tbs_attendance_shifts x WHERE x.user_id=uid AND x.work_date>=date_trunc('month',tbs_bkk_today())::date),
  'fixes',(SELECT COALESCE(jsonb_agg(tbs_attendance_fix_json(f) ORDER BY f.id DESC),'[]'::jsonb) FROM (SELECT * FROM tbs_attendance_fixes WHERE user_id=uid AND status<>'cancelled' ORDER BY id DESC LIMIT 20) f),
  'team','[]'::jsonb,'teamFixes','[]'::jsonb)
 FROM tbs_attendance_settings s WHERE s.singleton;
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_employee(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId'); s tbs_attendance_settings%ROWTYPE; x tbs_attendance_shifts%ROWTYPE; f tbs_attendance_fixes%ROWTYPE;
 d date; t_in timestamptz; t_out timestamptz; BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Your employee account is not active.');
 END IF;
 SELECT * INTO s FROM tbs_attendance_settings WHERE singleton;
 PERFORM tbs_attendance_close_stale(uid);
 IF operation='attendance-state' THEN RETURN tbs_attendance_state(uid); END IF;
 IF operation='attendance-team-decide' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','HR decides time fixes.'); END IF;
 IF NOT (s.enabled AND tbs_attendance_member(uid)) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Clock-in is not open for your account.'); END IF;
 IF operation IN ('attendance-in','attendance-out') AND NOT COALESCE(tbs_travel_coord(payload,'lat','lng'),false) THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Allow location so we can record where you clock in.');
 END IF;
 IF operation='attendance-in' THEN
  PERFORM tbs_attendance_purge();
  IF EXISTS(SELECT 1 FROM tbs_attendance_shifts WHERE user_id=uid AND out_at IS NULL AND NOT missed_out) THEN
   RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You are already clocked in.')||(tbs_attendance_state(uid)-'ok');
  END IF;
  IF NOT tbs_attendance_workday(uid,tbs_bkk_today()) THEN
   RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Today is an office day. Clock in only on your work-from-home days.')||(tbs_attendance_state(uid)-'ok');
  END IF;
  INSERT INTO tbs_attendance_shifts(user_id,work_date,in_at,in_lat,in_lng,in_accuracy_m)
   VALUES(uid,tbs_bkk_today(),now(),(payload->>'lat')::numeric,(payload->>'lng')::numeric,least(NULLIF(payload->>'accuracy','')::numeric,9999999));
  RETURN tbs_attendance_state(uid);
 END IF;
 IF operation='attendance-out' THEN
  SELECT * INTO x FROM tbs_attendance_shifts WHERE user_id=uid AND out_at IS NULL AND NOT missed_out ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF x.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You are not clocked in.')||(tbs_attendance_state(uid)-'ok'); END IF;
  IF now()<=x.in_at THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Please wait a moment before clocking out.'); END IF;
  UPDATE tbs_attendance_shifts SET out_at=now(),out_lat=(payload->>'lat')::numeric,out_lng=(payload->>'lng')::numeric,out_accuracy_m=least(NULLIF(payload->>'accuracy','')::numeric,9999999) WHERE id=x.id;
  RETURN tbs_attendance_state(uid);
 END IF;
 IF operation='attendance-fix' THEN
  IF COALESCE(payload->>'date','')!~'^\d{4}-\d{2}-\d{2}$' OR COALESCE(payload->>'in','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR COALESCE(payload->>'out','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Enter the date and both times.');
  END IF;
  d:=(payload->>'date')::date;
  IF d>tbs_bkk_today() OR d<tbs_bkk_today()-31 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose a day in the last 31 days.'); END IF;
  IF NULLIF(payload->>'shiftId','') IS NULL AND NOT tbs_attendance_workday(uid,d) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','That day is not one of your work-from-home days.'); END IF;
  IF length(btrim(COALESCE(payload->>'reason',''))) NOT BETWEEN 3 AND 500 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Tell HR why the time needs fixing.'); END IF;
  t_in:=tbs_attendance_time(d,payload->>'in');t_out:=tbs_attendance_time(d,payload->>'out');
  IF t_out<=t_in THEN t_out:=t_out+interval '1 day'; END IF;
  IF t_out-t_in>interval '16 hours' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','A shift can be at most 16 hours.'); END IF;
  IF t_out>now() THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','The clock-out time has not happened yet.'); END IF;
  IF NULLIF(payload->>'shiftId','') IS NOT NULL THEN
   SELECT * INTO x FROM tbs_attendance_shifts WHERE id=(payload->>'shiftId')::integer AND user_id=uid;
   IF x.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Shift not found.'); END IF;
   IF x.out_at IS NULL AND NOT x.missed_out THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Clock out first, then fix this shift.'); END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM tbs_attendance_shifts WHERE user_id=uid AND id IS DISTINCT FROM x.id AND tstzrange(in_at,COALESCE(out_at,in_at+interval '1 minute'))&&tstzrange(t_in,t_out)) THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','These times overlap another shift.');
  END IF;
  BEGIN
   INSERT INTO tbs_attendance_fixes(user_id,shift_id,work_date,in_at,out_at,reason) VALUES(uid,x.id,d,t_in,t_out,btrim(payload->>'reason'));
  EXCEPTION WHEN unique_violation THEN
   RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You already asked to fix this day. Cancel it first to send a new one.');
  END;
  RETURN tbs_attendance_state(uid);
 END IF;
 IF operation='attendance-fix-cancel' THEN
  UPDATE tbs_attendance_fixes SET status='cancelled' WHERE id=NULLIF(payload->>'id','')::integer AND user_id=uid AND status='pending' RETURNING * INTO f;
  IF f.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This request was already decided.'); END IF;
  RETURN tbs_attendance_state(uid);
 END IF;
 RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Unknown attendance operation.');
END $$;

CREATE OR REPLACE FUNCTION tbs_attendance_admin_people() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.user_id,'name',tbs_attendance_name(e.user_id),'department',e.department,'type',e.employment_type,
  'member',COALESCE(p.active,false),'kind',COALESCE(p.kind,'part-time'),'wfhDays',to_jsonb(tbs_attendance_wfh_days(e.user_id)))
  ORDER BY COALESCE(p.active,false) DESC,e.department,e.first_name),'[]'::jsonb)
 FROM tbs_employees e LEFT JOIN tbs_attendance_people p ON p.user_id=e.user_id WHERE COALESCE(e.status,'active')='active';
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_admin(op text,b jsonb,actor tbs_dashboard_accounts) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s tbs_attendance_settings%ROWTYPE; d_from date; d_to date; r jsonb; k text; days integer[]; BEGIN
 IF actor.role NOT IN ('admin','ceo','hr') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Operation not permitted'); END IF;
 IF op='attendance-settings-save' THEN
  IF jsonb_typeof(b->'enabled')<>'boolean' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose on or off.'); END IF;
  UPDATE tbs_attendance_settings SET enabled=(b->>'enabled')::boolean,updated_at=now(),updated_by=actor.username WHERE singleton;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'attendance-'||CASE WHEN (b->>'enabled')::boolean THEN 'on' ELSE 'off' END,NULL);
  op:='attendance-overview';
 ELSIF op='attendance-person-save' THEN
  IF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=b->>'userId') OR jsonb_typeof(b->'member')<>'boolean' THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Employee not found.'); END IF;
  k:=COALESCE(b->>'kind',tbs_attendance_kind(b->>'userId'));
  IF k NOT IN ('part-time','wfh') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose part-time or work from home.'); END IF;
  IF jsonb_typeof(b->'wfhDays')='array' THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(b->'wfhDays') v WHERE jsonb_typeof(v)<>'number' OR v::text NOT IN ('1','2','3','4','5','6','7')) THEN
    RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose the work-from-home days.');
   END IF;
   days:=ARRAY(SELECT DISTINCT v::text::integer FROM jsonb_array_elements(b->'wfhDays') v ORDER BY 1);
  ELSE days:=tbs_attendance_wfh_days(b->>'userId');
  END IF;
  IF k='part-time' THEN days:='{}'; END IF;
  IF k='wfh' AND (b->>'member')::boolean AND cardinality(days)=0 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose at least one work-from-home day.'); END IF;
  INSERT INTO tbs_attendance_people(user_id,active,kind,wfh_days,updated_by) VALUES(b->>'userId',(b->>'member')::boolean,k,days,actor.username)
   ON CONFLICT(user_id) DO UPDATE SET active=EXCLUDED.active,kind=EXCLUDED.kind,wfh_days=EXCLUDED.wfh_days,updated_at=now(),updated_by=EXCLUDED.updated_by;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'attendance-person-'||CASE WHEN (b->>'member')::boolean THEN 'add' ELSE 'remove' END,b->>'userId');
  op:='attendance-overview';
 ELSIF op='attendance-fix-decide' THEN
  r:=tbs_attendance_decide(NULLIF(b->>'id','')::integer,b->>'action',actor.username,b->>'note',NULL);
  IF NOT (r->>'ok')::boolean THEN RETURN r; END IF;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'attendance-fix-'||(b->>'action'),b->>'id');
  op:='attendance-overview';
 END IF;
 IF op<>'attendance-overview' THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Unknown attendance operation.'); END IF;
 PERFORM tbs_attendance_purge();
 SELECT * INTO s FROM tbs_attendance_settings WHERE singleton;
 d_from:=COALESCE(NULLIF(b->>'from','')::date,date_trunc('month',tbs_bkk_today())::date);
 d_to:=least(COALESCE(NULLIF(b->>'to','')::date,tbs_bkk_today()),d_from+92);
 RETURN jsonb_build_object('ok',true,'from',d_from,'to',d_to,'today',tbs_bkk_today(),
  'settings',jsonb_build_object('enabled',s.enabled,'workMinutes',s.work_minutes,'wfhWorkMinutes',s.wfh_work_minutes,'breakMinutes',s.break_minutes,'breakAfterMinutes',s.break_after_minutes,'locationDays',s.location_days,'updatedAt',s.updated_at,'updatedBy',s.updated_by),
  'people',tbs_attendance_admin_people(),
  'shifts',(SELECT COALESCE(jsonb_agg(tbs_attendance_shift_json(x,true)||jsonb_build_object('userId',x.user_id,'employee',tbs_attendance_name(x.user_id)) ORDER BY x.in_at DESC),'[]'::jsonb)
   FROM tbs_attendance_shifts x WHERE x.work_date BETWEEN d_from AND d_to),
  'fixes',(SELECT COALESCE(jsonb_agg(tbs_attendance_fix_json(f) ORDER BY f.status<>'pending',f.id DESC),'[]'::jsonb)
   FROM tbs_attendance_fixes f WHERE f.status='pending' OR (f.status IN ('approved','rejected') AND f.decided_at>now()-interval '30 days')));
END $$;
COMMIT;
