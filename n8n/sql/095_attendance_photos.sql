BEGIN;
CREATE TABLE IF NOT EXISTS tbs_attendance_photos(
 shift_id integer NOT NULL REFERENCES tbs_attendance_shifts(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('in','out')),
 mime text NOT NULL DEFAULT 'image/jpeg' CHECK(mime='image/jpeg'),
 content bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(shift_id,kind)
);

CREATE OR REPLACE FUNCTION tbs_attendance_shift_json(x tbs_attendance_shifts,with_location boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',x.id,'date',x.work_date,'in',x.in_at,'out',x.out_at,'missedOut',x.missed_out,'edited',x.edited,
  'workedMin',tbs_attendance_worked(x.in_at,x.out_at),
  'overtimeMin',greatest(0,tbs_attendance_worked(x.in_at,x.out_at)-tbs_attendance_target(x.user_id)),
  'inPhoto',EXISTS(SELECT 1 FROM tbs_attendance_photos p WHERE p.shift_id=x.id AND p.kind='in'),
  'outPhoto',EXISTS(SELECT 1 FROM tbs_attendance_photos p WHERE p.shift_id=x.id AND p.kind='out'))
 ||CASE WHEN with_location THEN jsonb_build_object('inLat',x.in_lat,'inLng',x.in_lng,'inAccuracy',x.in_accuracy_m,'outLat',x.out_lat,'outLng',x.out_lng,'outAccuracy',x.out_accuracy_m) ELSE '{}'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION tbs_attendance_purge() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer; keep interval:=make_interval(days=>(SELECT location_days FROM tbs_attendance_settings WHERE singleton)); BEGIN
 UPDATE tbs_attendance_shifts SET in_lat=NULL,in_lng=NULL,in_accuracy_m=NULL,out_lat=NULL,out_lng=NULL,out_accuracy_m=NULL
 WHERE in_at<now()-keep AND (in_lat IS NOT NULL OR out_lat IS NOT NULL);
 GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM tbs_attendance_photos p USING tbs_attendance_shifts x WHERE x.id=p.shift_id AND x.in_at<now()-keep;
 RETURN n;
END $$;

DO $$ BEGIN
 IF to_regprocedure('tbs_attendance_employee_before_photo(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_attendance_employee(text,jsonb) RENAME TO tbs_attendance_employee_before_photo;
 END IF;
 IF to_regprocedure('tbs_dashboard_auth_before_attendance_photo(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_attendance_photo;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION tbs_attendance_employee(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE pic text:=COALESCE(payload->>'photo',''); uid text:=tbs_resolve_employee(payload->>'accountId'); r jsonb; sid integer; BEGIN
 IF operation IN ('attendance-in','attendance-out') AND (SELECT enabled FROM tbs_attendance_settings WHERE singleton) AND tbs_attendance_member(uid)
  AND (length(pic) NOT BETWEEN 1000 AND 2900000 OR left(pic,4)<>'/9j/' OR pic!~'^[A-Za-z0-9+/]+={0,2}$') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Take a photo of yourself at work to clock '||substr(operation,12)||'.');
 END IF;
 r:=tbs_attendance_employee_before_photo(operation,payload-'photo');
 IF operation IN ('attendance-in','attendance-out') AND COALESCE((r->>'ok')::boolean,false) THEN
  IF operation='attendance-in' THEN
   SELECT id INTO sid FROM tbs_attendance_shifts WHERE user_id=uid AND out_at IS NULL AND NOT missed_out ORDER BY id DESC LIMIT 1;
  ELSE
   SELECT id INTO sid FROM tbs_attendance_shifts WHERE user_id=uid AND out_at IS NOT NULL ORDER BY out_at DESC LIMIT 1;
  END IF;
  INSERT INTO tbs_attendance_photos(shift_id,kind,content) VALUES(sid,substr(operation,12),decode(pic,'base64'))
   ON CONFLICT(shift_id,kind) DO UPDATE SET content=EXCLUDED.content,created_at=now();
  r:=tbs_attendance_state(uid);
 END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; b jsonb:=COALESCE(payload->'body','{}'::jsonb); BEGIN
 IF payload->>'operation' IS DISTINCT FROM 'attendance-photo' THEN RETURN tbs_dashboard_auth_before_attendance_photo(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF actor.role NOT IN ('admin','ceo','hr') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Operation not permitted'); END IF;
 IF COALESCE(b->>'shiftId','')!~'^[1-9][0-9]{0,8}$' OR COALESCE(b->>'kind','') NOT IN ('in','out') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid photo'); END IF;
 RETURN COALESCE((SELECT jsonb_build_object('ok',true,'mime',mime,'content',translate(encode(content,'base64'),E'\n','')) FROM tbs_attendance_photos WHERE shift_id=(b->>'shiftId')::integer AND kind=b->>'kind'),
  jsonb_build_object('ok',false,'statusCode',404,'error','Photo not found.'));
END $$;
COMMIT;
