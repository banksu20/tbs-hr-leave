BEGIN;
CREATE TABLE IF NOT EXISTS tbs_attendance_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 work_minutes integer NOT NULL DEFAULT 420 CHECK(work_minutes BETWEEN 60 AND 720),
 break_minutes integer NOT NULL DEFAULT 60 CHECK(break_minutes BETWEEN 0 AND 180),
 break_after_minutes integer NOT NULL DEFAULT 300 CHECK(break_after_minutes BETWEEN 60 AND 720),
 location_days integer NOT NULL DEFAULT 90 CHECK(location_days BETWEEN 7 AND 730),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
INSERT INTO tbs_attendance_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_attendance_people(
 user_id text PRIMARY KEY REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
CREATE TABLE IF NOT EXISTS tbs_attendance_shifts(
 id serial PRIMARY KEY,
 user_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 work_date date NOT NULL,
 in_at timestamptz NOT NULL,
 in_lat numeric(9,6),in_lng numeric(9,6),in_accuracy_m numeric(8,1),
 out_at timestamptz,
 out_lat numeric(9,6),out_lng numeric(9,6),out_accuracy_m numeric(8,1),
 missed_out boolean NOT NULL DEFAULT false,
 edited boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(out_at IS NULL OR out_at>in_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS tbs_attendance_one_open ON tbs_attendance_shifts(user_id) WHERE out_at IS NULL AND NOT missed_out;
CREATE INDEX IF NOT EXISTS tbs_attendance_shift_day ON tbs_attendance_shifts(work_date,user_id);
CREATE TABLE IF NOT EXISTS tbs_attendance_fixes(
 id serial PRIMARY KEY,
 user_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 shift_id integer REFERENCES tbs_attendance_shifts(id) ON DELETE SET NULL,
 work_date date NOT NULL,
 in_at timestamptz NOT NULL,
 out_at timestamptz NOT NULL CHECK(out_at>in_at),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 decided_by text,
 decided_at timestamptz,
 decision_note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tbs_attendance_one_pending_fix ON tbs_attendance_fixes(user_id,work_date) WHERE status='pending';

CREATE OR REPLACE FUNCTION tbs_bkk_today() RETURNS date LANGUAGE sql STABLE AS $$
 SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date;
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_worked(in_at timestamptz,out_at timestamptz) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN out_at IS NULL OR out_at<=in_at THEN 0 ELSE greatest(0,span-CASE WHEN span>s.break_after_minutes THEN s.break_minutes ELSE 0 END) END
 FROM (SELECT floor(extract(epoch FROM out_at-in_at)/60)::integer span) x,tbs_attendance_settings s WHERE s.singleton;
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_member(uid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM tbs_attendance_people p JOIN tbs_employees e ON e.user_id=p.user_id WHERE p.user_id=uid AND p.active AND COALESCE(e.status,'active')='active');
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_checker(uid text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT m.user_id FROM tbs_employees e JOIN tbs_employees m ON m.user_id=e.manager_user_id AND COALESCE(m.status,'active')='active' WHERE e.user_id=uid),
  (SELECT s.supervisor_id FROM tbs_intern_supervisors s JOIN tbs_employees m ON m.user_id=s.supervisor_id AND COALESCE(m.status,'active')='active' WHERE s.user_id=uid ORDER BY s.supervisor_id LIMIT 1));
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_name(uid text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(btrim(concat_ws(' ',first_name,last_name)),''),nickname,uid)||CASE WHEN COALESCE(nickname,'')<>'' AND btrim(concat_ws(' ',first_name,last_name))<>'' THEN ' ('||nickname||')' ELSE '' END
 FROM tbs_employees WHERE user_id=uid;
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_shift_json(x tbs_attendance_shifts,with_location boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',x.id,'date',x.work_date,'in',x.in_at,'out',x.out_at,'missedOut',x.missed_out,'edited',x.edited,
  'workedMin',tbs_attendance_worked(x.in_at,x.out_at),
  'overtimeMin',greatest(0,tbs_attendance_worked(x.in_at,x.out_at)-(SELECT work_minutes FROM tbs_attendance_settings WHERE singleton)))
 ||CASE WHEN with_location THEN jsonb_build_object('inLat',x.in_lat,'inLng',x.in_lng,'inAccuracy',x.in_accuracy_m,'outLat',x.out_lat,'outLng',x.out_lng,'outAccuracy',x.out_accuracy_m) ELSE '{}'::jsonb END;
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_fix_json(f tbs_attendance_fixes) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',f.id,'userId',f.user_id,'employee',tbs_attendance_name(f.user_id),'shiftId',f.shift_id,'date',f.work_date,'in',f.in_at,'out',f.out_at,
  'workedMin',tbs_attendance_worked(f.in_at,f.out_at),'reason',f.reason,'status',f.status,'decidedBy',f.decided_by,'decidedAt',f.decided_at,'note',f.decision_note,'createdAt',f.created_at,
  'was',(SELECT jsonb_build_object('in',s.in_at,'out',s.out_at,'missedOut',s.missed_out) FROM tbs_attendance_shifts s WHERE s.id=f.shift_id));
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_purge() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer; BEGIN
 UPDATE tbs_attendance_shifts SET in_lat=NULL,in_lng=NULL,in_accuracy_m=NULL,out_lat=NULL,out_lng=NULL,out_accuracy_m=NULL
 WHERE in_at<now()-make_interval(days=>(SELECT location_days FROM tbs_attendance_settings WHERE singleton))
  AND (in_lat IS NOT NULL OR out_lat IS NOT NULL);
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION tbs_attendance_close_stale(uid text) RETURNS void LANGUAGE sql AS $$
 UPDATE tbs_attendance_shifts SET missed_out=true WHERE user_id=uid AND out_at IS NULL AND NOT missed_out AND in_at<now()-interval '16 hours';
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_state(uid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('ok',true,'enabled',s.enabled,'member',tbs_attendance_member(uid),'eligible',s.enabled AND tbs_attendance_member(uid),
  'settings',jsonb_build_object('workMinutes',s.work_minutes,'breakMinutes',s.break_minutes,'breakAfterMinutes',s.break_after_minutes,'locationDays',s.location_days),
  'today',tbs_bkk_today(),
  'open',(SELECT tbs_attendance_shift_json(x,true) FROM tbs_attendance_shifts x WHERE x.user_id=uid AND x.out_at IS NULL AND NOT x.missed_out ORDER BY x.id DESC LIMIT 1),
  'shifts',(SELECT COALESCE(jsonb_agg(tbs_attendance_shift_json(x,true) ORDER BY x.in_at DESC),'[]'::jsonb) FROM tbs_attendance_shifts x WHERE x.user_id=uid AND x.work_date>=tbs_bkk_today()-40),
  'weekMin',(SELECT COALESCE(sum(tbs_attendance_worked(x.in_at,x.out_at)),0) FROM tbs_attendance_shifts x WHERE x.user_id=uid AND x.work_date>=date_trunc('week',tbs_bkk_today())::date),
  'monthMin',(SELECT COALESCE(sum(tbs_attendance_worked(x.in_at,x.out_at)),0) FROM tbs_attendance_shifts x WHERE x.user_id=uid AND x.work_date>=date_trunc('month',tbs_bkk_today())::date),
  'fixes',(SELECT COALESCE(jsonb_agg(tbs_attendance_fix_json(f) ORDER BY f.id DESC),'[]'::jsonb) FROM (SELECT * FROM tbs_attendance_fixes WHERE user_id=uid AND status<>'cancelled' ORDER BY id DESC LIMIT 20) f),
  'team',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.user_id,'name',tbs_attendance_name(p.user_id),
    'open',(SELECT x.in_at FROM tbs_attendance_shifts x WHERE x.user_id=p.user_id AND x.out_at IS NULL AND NOT x.missed_out ORDER BY x.id DESC LIMIT 1),
    'todayMin',(SELECT COALESCE(sum(tbs_attendance_worked(x.in_at,x.out_at)),0) FROM tbs_attendance_shifts x WHERE x.user_id=p.user_id AND x.work_date=tbs_bkk_today()),
    'weekMin',(SELECT COALESCE(sum(tbs_attendance_worked(x.in_at,x.out_at)),0) FROM tbs_attendance_shifts x WHERE x.user_id=p.user_id AND x.work_date>=date_trunc('week',tbs_bkk_today())::date)) ORDER BY tbs_attendance_name(p.user_id)),'[]'::jsonb)
   FROM tbs_attendance_people p WHERE p.active AND tbs_attendance_checker(p.user_id)=uid),
  'teamFixes',(SELECT COALESCE(jsonb_agg(tbs_attendance_fix_json(f) ORDER BY f.id),'[]'::jsonb) FROM tbs_attendance_fixes f WHERE f.status='pending' AND tbs_attendance_checker(f.user_id)=uid))
 FROM tbs_attendance_settings s WHERE s.singleton;
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_apply_fix(f tbs_attendance_fixes) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF f.shift_id IS NOT NULL AND EXISTS(SELECT 1 FROM tbs_attendance_shifts WHERE id=f.shift_id) THEN
  UPDATE tbs_attendance_shifts SET in_at=f.in_at,out_at=f.out_at,missed_out=false,edited=true WHERE id=f.shift_id;
 ELSE
  INSERT INTO tbs_attendance_shifts(user_id,work_date,in_at,out_at,edited) VALUES(f.user_id,f.work_date,f.in_at,f.out_at,true);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_attendance_decide(fix_id integer,act text,actor text,note text,checker text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f tbs_attendance_fixes%ROWTYPE; BEGIN
 SELECT * INTO f FROM tbs_attendance_fixes WHERE id=fix_id FOR UPDATE;
 IF f.id IS NULL OR (checker IS NOT NULL AND tbs_attendance_checker(f.user_id) IS DISTINCT FROM checker) THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Request not found.'); END IF;
 IF f.status<>'pending' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This request was already decided.'); END IF;
 IF act NOT IN ('approve','reject') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose approve or reject.'); END IF;
 UPDATE tbs_attendance_fixes SET status=CASE WHEN act='approve' THEN 'approved' ELSE 'rejected' END,decided_by=actor,decided_at=now(),decision_note=NULLIF(left(btrim(COALESCE(note,'')),500),'') WHERE id=f.id RETURNING * INTO f;
 IF act='approve' THEN PERFORM tbs_attendance_apply_fix(f); END IF;
 RETURN jsonb_build_object('ok',true,'fix',tbs_attendance_fix_json(f));
END $$;
CREATE OR REPLACE FUNCTION tbs_attendance_time(d date,hhmm text) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
 SELECT (d+hhmm::time) AT TIME ZONE 'Asia/Bangkok';
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_employee(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId'); s tbs_attendance_settings%ROWTYPE; x tbs_attendance_shifts%ROWTYPE; f tbs_attendance_fixes%ROWTYPE;
 d date; t_in timestamptz; t_out timestamptz; r jsonb; BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Your employee account is not active.');
 END IF;
 SELECT * INTO s FROM tbs_attendance_settings WHERE singleton;
 PERFORM tbs_attendance_close_stale(uid);
 IF operation='attendance-state' THEN RETURN tbs_attendance_state(uid); END IF;
 IF operation='attendance-team-decide' THEN
  r:=tbs_attendance_decide(NULLIF(payload->>'id','')::integer,payload->>'decision',tbs_attendance_name(uid),payload->>'note',uid);
  IF NOT (r->>'ok')::boolean THEN RETURN r; END IF;
  RETURN tbs_attendance_state(uid);
 END IF;
 IF NOT (s.enabled AND tbs_attendance_member(uid)) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Clock-in is not open for your account.'); END IF;
 IF operation IN ('attendance-in','attendance-out') AND NOT COALESCE(tbs_travel_coord(payload,'lat','lng'),false) THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Allow location so we can record where you clock in.');
 END IF;
 IF operation='attendance-in' THEN
  PERFORM tbs_attendance_purge();
  IF EXISTS(SELECT 1 FROM tbs_attendance_shifts WHERE user_id=uid AND out_at IS NULL AND NOT missed_out) THEN
   RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You are already clocked in.')||(tbs_attendance_state(uid)-'ok');
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
  IF length(btrim(COALESCE(payload->>'reason',''))) NOT BETWEEN 3 AND 500 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Tell your team lead why the time needs fixing.'); END IF;
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
  IF tbs_attendance_checker(uid) IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You have no team lead yet. Please ask HR to set one.'); END IF;
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
  'member',COALESCE(p.active,false),'checkerId',tbs_attendance_checker(e.user_id),'checker',tbs_attendance_name(tbs_attendance_checker(e.user_id)))
  ORDER BY COALESCE(p.active,false) DESC,e.department,e.first_name),'[]'::jsonb)
 FROM tbs_employees e LEFT JOIN tbs_attendance_people p ON p.user_id=e.user_id WHERE COALESCE(e.status,'active')='active';
$$;
CREATE OR REPLACE FUNCTION tbs_attendance_admin(op text,b jsonb,actor tbs_dashboard_accounts) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s tbs_attendance_settings%ROWTYPE; d_from date; d_to date; r jsonb; BEGIN
 IF actor.role NOT IN ('admin','ceo','hr') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Operation not permitted'); END IF;
 IF op='attendance-settings-save' THEN
  IF jsonb_typeof(b->'enabled')<>'boolean' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose on or off.'); END IF;
  UPDATE tbs_attendance_settings SET enabled=(b->>'enabled')::boolean,updated_at=now(),updated_by=actor.username WHERE singleton;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'attendance-'||CASE WHEN (b->>'enabled')::boolean THEN 'on' ELSE 'off' END,NULL);
  op:='attendance-overview';
 ELSIF op='attendance-person-save' THEN
  IF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=b->>'userId') OR jsonb_typeof(b->'member')<>'boolean' THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Employee not found.'); END IF;
  INSERT INTO tbs_attendance_people(user_id,active,updated_by) VALUES(b->>'userId',(b->>'member')::boolean,actor.username)
   ON CONFLICT(user_id) DO UPDATE SET active=EXCLUDED.active,updated_at=now(),updated_by=EXCLUDED.updated_by;
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
  'settings',jsonb_build_object('enabled',s.enabled,'workMinutes',s.work_minutes,'breakMinutes',s.break_minutes,'breakAfterMinutes',s.break_after_minutes,'locationDays',s.location_days,'updatedAt',s.updated_at,'updatedBy',s.updated_by),
  'people',tbs_attendance_admin_people(),
  'shifts',(SELECT COALESCE(jsonb_agg(tbs_attendance_shift_json(x,true)||jsonb_build_object('userId',x.user_id,'employee',tbs_attendance_name(x.user_id)) ORDER BY x.in_at DESC),'[]'::jsonb)
   FROM tbs_attendance_shifts x WHERE x.work_date BETWEEN d_from AND d_to),
  'fixes',(SELECT COALESCE(jsonb_agg(tbs_attendance_fix_json(f)||jsonb_build_object('checker',tbs_attendance_name(tbs_attendance_checker(f.user_id))) ORDER BY f.status<>'pending',f.id DESC),'[]'::jsonb)
   FROM tbs_attendance_fixes f WHERE f.status='pending' OR (f.status IN ('approved','rejected') AND f.decided_at>now()-interval '30 days')));
END $$;
DO $$ BEGIN
 IF to_regprocedure('tbs_cancellation_before_attendance(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_cancellation(text,jsonb) RENAME TO tbs_cancellation_before_attendance;
 END IF;
 IF to_regprocedure('tbs_dashboard_auth_before_attendance(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_attendance;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF operation LIKE 'attendance-%' THEN RETURN tbs_attendance_employee(operation,payload); END IF;
 RETURN tbs_cancellation_before_attendance(operation,payload);
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; BEGIN
 IF op NOT IN ('attendance-overview','attendance-settings-save','attendance-person-save','attendance-fix-decide') THEN RETURN tbs_dashboard_auth_before_attendance(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 RETURN tbs_attendance_admin(op,COALESCE(payload->'body','{}'::jsonb),actor);
END $$;
COMMIT;
