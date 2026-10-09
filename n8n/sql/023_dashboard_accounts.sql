BEGIN;
ALTER TABLE tbs_employees ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'employee' CHECK(employment_type IN ('employee','intern'));
ALTER TABLE tbs_employees ADD COLUMN IF NOT EXISTS intern_number integer CHECK(intern_number>0);
CREATE UNIQUE INDEX IF NOT EXISTS tbs_intern_number ON tbs_employees(intern_number) WHERE intern_number IS NOT NULL;
CREATE TABLE IF NOT EXISTS tbs_dashboard_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),username text NOT NULL UNIQUE CHECK(username~'^[a-z0-9._-]{2,64}$'),password_hash text NOT NULL,role text NOT NULL CHECK(role IN ('admin','ceo','hr')),active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE tbs_dashboard_accounts DROP CONSTRAINT IF EXISTS tbs_dashboard_accounts_username_check;
ALTER TABLE tbs_dashboard_accounts ADD CONSTRAINT tbs_dashboard_accounts_username_check CHECK(username~'^[a-z0-9._-]{2,64}$');
CREATE TABLE IF NOT EXISTS tbs_dashboard_sessions(token_hash text PRIMARY KEY CHECK(token_hash~'^[a-f0-9]{64}$'),account_id uuid NOT NULL REFERENCES tbs_dashboard_accounts(id) ON DELETE CASCADE,version integer NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '8 hours');
CREATE TABLE IF NOT EXISTS tbs_dashboard_login_limits(key text PRIMARY KEY,attempts integer NOT NULL,window_start timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS tbs_dashboard_account_audit(id bigserial PRIMARY KEY,actor_id uuid,action text NOT NULL,target text,created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION tbs_dashboard_actor(hash text) RETURNS tbs_dashboard_accounts LANGUAGE sql STABLE AS $$
 SELECT a.* FROM tbs_dashboard_sessions s JOIN tbs_dashboard_accounts a ON a.id=s.account_id WHERE s.token_hash=hash AND s.expires_at>now() AND a.active AND a.version=s.version;
$$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE op text:=payload->>'operation'; actor tbs_dashboard_accounts%ROWTYPE; target tbs_dashboard_accounts%ROWTYPE; k text; attempts integer; result jsonb; uid text; current_uid text; yr integer; next_no integer;
BEGIN
 IF op='bootstrap' THEN
  LOCK TABLE tbs_dashboard_accounts IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS(SELECT 1 FROM tbs_dashboard_accounts) THEN
   IF COALESCE(payload->>'passwordHash','') !~ '^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid password hash'); END IF;
   INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('admin',payload->>'passwordHash','admin');
   INSERT INTO tbs_dashboard_account_audit(action,target) VALUES('bootstrap','admin');
  END IF;
  RETURN jsonb_build_object('ok',true);
 ELSIF op='login-start' THEN
  FOREACH k IN ARRAY ARRAY['user:'||lower(payload->>'username'),'ip:'||(payload->>'ipHash')] LOOP
   INSERT INTO tbs_dashboard_login_limits VALUES(k,1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN tbs_dashboard_login_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE tbs_dashboard_login_limits.attempts+1 END,window_start=CASE WHEN tbs_dashboard_login_limits.window_start<now()-interval '15 minutes' THEN now() ELSE tbs_dashboard_login_limits.window_start END RETURNING tbs_dashboard_login_limits.attempts INTO attempts;
   IF attempts>(CASE WHEN k LIKE 'ip:%' THEN 30 ELSE 5 END) THEN RETURN jsonb_build_object('ok',false,'statusCode',429,'error','Too many login attempts'); END IF;
  END LOOP;
  SELECT * INTO target FROM tbs_dashboard_accounts WHERE username=lower(payload->>'username') AND active;
  RETURN jsonb_build_object('ok',true,'account',CASE WHEN target.id IS NULL THEN NULL ELSE to_jsonb(target) END);
 ELSIF op='login-finish' THEN
  SELECT * INTO target FROM tbs_dashboard_accounts WHERE id::text=payload->>'id' AND active AND version=(payload->>'version')::int FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in again'); END IF;
  INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) VALUES(payload->>'sessionHash',target.id,target.version);
  DELETE FROM tbs_dashboard_login_limits WHERE key='user:'||target.username;
  DELETE FROM tbs_dashboard_sessions WHERE expires_at<=now();
  RETURN jsonb_build_object('ok',true);
 ELSIF op='logout' THEN
  DELETE FROM tbs_dashboard_sessions WHERE token_hash=payload->>'sessionHash';RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF op='session' THEN RETURN jsonb_build_object('ok',true,'session',jsonb_build_object('id',actor.id,'username',actor.username,'role',actor.role)); END IF;
 IF op IN ('accounts-list','account-save') THEN
  IF actor.role<>'admin' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Admin access required'); END IF;
  IF op='accounts-list' THEN RETURN jsonb_build_object('ok',true,'accounts',COALESCE((SELECT jsonb_agg(to_jsonb(a)-'password_hash') FROM tbs_dashboard_accounts a),'[]'::jsonb)); END IF;
  LOCK TABLE tbs_dashboard_accounts IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
  IF actor.id IS NULL OR actor.role<>'admin' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Admin session is no longer valid'); END IF;
  IF payload->>'role' NOT IN ('admin','ceo','hr') OR COALESCE(payload->>'username','') !~ '^[a-z0-9._-]{2,64}$' OR jsonb_typeof(payload->'active') IS DISTINCT FROM 'boolean' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid account'); END IF;
  SELECT * INTO target FROM tbs_dashboard_accounts WHERE id::text=payload->>'id';
  IF target.id=actor.id AND (payload->>'active'='false' OR payload->>'role'<>'admin') THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You cannot disable or demote your own admin account'); END IF;
  IF payload ? 'passwordHash' AND COALESCE(payload->>'passwordHash','') !~ '^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid password hash'); END IF;
  IF target.id IS NULL THEN
   IF payload->>'id' IS NOT NULL OR payload->>'passwordHash' IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','New accounts need a password'); END IF;
   INSERT INTO tbs_dashboard_accounts(username,password_hash,role,active) VALUES(payload->>'username',payload->>'passwordHash',payload->>'role',(payload->>'active')::boolean) RETURNING * INTO target;
  ELSE
   UPDATE tbs_dashboard_accounts SET username=payload->>'username',password_hash=COALESCE(payload->>'passwordHash',password_hash),role=payload->>'role',active=(payload->>'active')::boolean,version=version+1 WHERE id=target.id;
   DELETE FROM tbs_dashboard_sessions WHERE account_id=target.id;
  END IF;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'account-save',target.id::text);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF op IN ('data','cancel-list') AND (COALESCE(payload->>'cohort','employee') NOT IN ('employee','intern') OR (actor.role='hr' AND payload->>'cohort' IS DISTINCT FROM 'intern')) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','You cannot access this record group'); END IF;
 IF op='data' THEN
  yr:=(payload->>'year')::int;
  IF yr NOT BETWEEN 2000 AND 2100 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid year'); END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(records)),'[]'::jsonb) INTO result FROM (
SELECT e.user_id, e.tbs_id, e.first_name, e.last_name, e.nickname, e.department, e.employment_type, e.intern_number,
  COALESCE(e.status, 'active') AS status,
  to_char(e.start_date, 'YYYY-MM-DD') AS start_date,
  (q.rollover_source_year IS NOT NULL AND q.rollover_source_unused IS DISTINCT FROM tbs_rollover_unused(e.user_id,q.rollover_source_year)) AS "rolloverNeedsReview",
  CASE WHEN q.user_id IS NULL THEN 'missing' ELSE md5(to_jsonb(q)::text) END AS "quotaRevision",
  COALESCE(q.carried_over,0) AS "storedCarriedOver", q.carryover_expires_on AS "carryoverExpiresOn",
  q.annual_total AS "annualTotal", q.sick_total AS "sickTotal",
  COALESCE(q.personal_total, 3) AS "personalTotal", COALESCE(q.carried_over, 0) AS "carriedOver",
  (q.user_id IS NOT NULL) AS "quotasKnown", COALESCE(q.note, '') AS "quotaNote",
  COALESCE(json_agg(json_build_object(
    'id', r.id::text, 'revision', md5(to_jsonb(r)::text), 'leave_type', r.leave_type, 'leave_days', r.leave_days,
    'start_date', to_char(r.start_date, 'YYYY-MM-DD'), 'end_date', to_char(r.end_date, 'YYYY-MM-DD'),
    'selected_dates', tbs_request_dates(r.selected_dates::text, r.start_date::date, r.end_date::date),
    'reason', r.reason, 'status', r.status, 'half_day_period', r.half_day_period
  ) ORDER BY r.start_date, r.id) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS requests
FROM tbs_employees e
LEFT JOIN leave_quotas q ON q.user_id = e.user_id AND q.year = yr
LEFT JOIN leave_requests r ON r.user_id = e.user_id AND r.status != 'Rejected'
  AND EXISTS (SELECT 1 FROM unnest(tbs_request_dates(r.selected_dates::text, r.start_date::date, r.end_date::date)) day
    WHERE day >= make_date(yr, 1, 1) AND day < make_date(yr + 1, 1, 1))
WHERE e.employment_type=COALESCE(payload->>'cohort','employee') AND (actor.role<>'hr' OR e.employment_type='intern') AND NOT EXISTS (SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=e.user_id)
GROUP BY e.employment_type, e.intern_number, e.user_id, e.tbs_id, e.first_name, e.last_name, e.nickname, e.department, e.status, e.start_date,
  q, q.rollover_source_year, q.rollover_source_unused, q.carryover_expires_on, q.user_id, q.annual_total, q.sick_total, q.personal_total, q.carried_over, q.note
ORDER BY CASE WHEN e.employment_type='intern' THEN e.intern_number ELSE e.tbs_id END
  ) records;
  RETURN jsonb_build_object('ok',true,'employees',result);
 END IF;
 IF op='employee-types' AND actor.role IN ('admin','ceo') THEN RETURN jsonb_build_object('ok',true,'employees',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.user_id,'name',concat_ws(' ',e.first_name,e.last_name),'type',e.employment_type,'internNumber',e.intern_number)) FROM tbs_employees e WHERE NOT EXISTS(SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=e.user_id)),'[]'::jsonb)); END IF;
 IF op='employee-type' AND actor.role IN ('admin','ceo') THEN
  IF payload->>'type' NOT IN ('employee','intern') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid classification'); END IF;
  LOCK TABLE tbs_employees IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(intern_number),0)+1 INTO next_no FROM tbs_employees;
  UPDATE tbs_employees SET employment_type=payload->>'type',intern_number=CASE WHEN payload->>'type'='intern' THEN COALESCE(intern_number,next_no) ELSE intern_number END WHERE user_id=payload->>'userId' AND NOT EXISTS(SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=tbs_employees.user_id);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Main employee not found'); END IF;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'employee-type:'||(payload->>'type'),payload->>'userId');
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF op='history' AND actor.role IN ('admin','ceo') THEN
SELECT COALESCE(jsonb_agg(to_jsonb(events) ORDER BY events.id::bigint DESC),'[]'::jsonb) INTO result
FROM (
  SELECT h.id::text, h.changed_at AS "changedAt", h.entity, h.record_id AS "recordId", h.user_id AS "userId",
    concat_ws(' ',e.first_name,e.last_name) AS "employeeName", e.department,
    h.action, h.actor, (h.before_value - 'decision_token') AS "before", (h.after_value - 'decision_token') AS "after",
    (h.action='cancel' AND h.after_value=to_jsonb(r) AND e.status='active'
      AND NOT EXISTS(SELECT 1 FROM tbs_change_history newer WHERE newer.entity=h.entity AND newer.record_id=h.record_id AND newer.id>h.id)) AS "canRestore"
  FROM tbs_change_history h
  LEFT JOIN tbs_employees e ON e.user_id=h.user_id
  LEFT JOIN leave_requests r ON h.entity='leave_requests' AND r.id::text=h.record_id
  WHERE e.employment_type='employee' AND ((payload->>'userId') IS NULL OR h.user_id=(payload->>'userId')) AND ((payload->>'cursor')::bigint IS NULL OR h.id<(payload->>'cursor')::bigint)
  ORDER BY h.id DESC LIMIT 50
) events;
  RETURN jsonb_build_object('ok',true,'events',result);
 END IF;
 IF op='cancel-list' THEN
  result:=tbs_cancellation('admin-list','{}');
  SELECT COALESCE(jsonb_agg(v||jsonb_build_object('displayCode',CASE WHEN e.employment_type='intern' THEN 'TBSInterns-'||lpad(e.intern_number::text,GREATEST(3,length(e.intern_number::text)),'0') ELSE 'TBS-'||lpad(e.tbs_id::text,3,'0') END)),'[]'::jsonb) INTO result FROM jsonb_array_elements(result->'requests') v JOIN tbs_employees e ON e.user_id=v->>'user_id' WHERE e.employment_type=COALESCE(payload->>'cohort','employee') AND (actor.role<>'hr' OR e.employment_type='intern');
  RETURN jsonb_build_object('ok',true,'requests',result);
 END IF;
 IF op IN ('leave-create','leave-update','leave-delete','cancel-approve','cancel-reject','intern-archive','intern-restore') THEN
  IF op='leave-create' OR op IN ('intern-archive','intern-restore') THEN uid:=payload->'body'->>'userId';
  ELSIF op LIKE 'cancel-%' THEN SELECT user_id INTO uid FROM tbs_cancellation_requests WHERE id=(payload->'body'->>'id')::bigint;
  ELSE SELECT user_id INTO uid FROM leave_requests WHERE id=(payload->'body'->>'id')::int; END IF;
  PERFORM 1 FROM tbs_employees WHERE user_id=uid FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR (actor.role='hr' AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern')) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','You cannot access this record'); END IF;
  IF op IN ('intern-archive','intern-restore') THEN
   IF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Intern record required'); END IF;
   UPDATE tbs_employees SET status=CASE WHEN op='intern-archive' THEN 'inactive' ELSE 'active' END WHERE user_id=uid;
   INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,op,uid);
   RETURN jsonb_build_object('ok',true);
  END IF;
  IF op IN ('leave-update','leave-delete') THEN
   SELECT user_id INTO current_uid FROM leave_requests WHERE id=(payload->'body'->>'id')::int FOR UPDATE;
   IF current_uid IS DISTINCT FROM uid THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Record changed. Refresh.'); END IF;
  END IF;
  PERFORM set_config('app.tbs_actor',actor.username,true);
  IF op LIKE 'cancel-%' THEN RETURN tbs_cancellation(replace(op,'cancel-',''),payload->'body'); END IF;
  RETURN tbs_dashboard_request_v2(CASE WHEN op='leave-create' THEN 'create' WHEN op='leave-delete' THEN 'delete' WHEN payload->'body'->>'action' IN ('restore','approve','reject') THEN payload->'body'->>'action' ELSE 'update' END,payload->'body');
 END IF;
 RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Operation not permitted');
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Username or intern code already exists');
 WHEN invalid_text_representation THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid account or record');
END $$;
-- Intern creation stays blocked even when accounts ship before the leave-policy release.
CREATE OR REPLACE FUNCTION tbs_intern_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=NEW.user_id AND employment_type='intern') THEN
  RAISE EXCEPTION 'Intern leave rules have not been configured' USING ERRCODE='P2001';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_intern_request_guard ON leave_requests;
CREATE TRIGGER tbs_intern_request_guard BEFORE INSERT ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_intern_request_guard();
-- Employee rollover excludes interns whose policy is not configured.
DO $$ DECLARE definition text; target regprocedure; BEGIN
 target:=COALESCE(to_regprocedure('tbs_rollover_before_policy(jsonb)'),to_regprocedure('tbs_rollover(jsonb)'));
 SELECT pg_get_functiondef(target) INTO definition;
 IF strpos(definition,'e.employment_type')=0 THEN definition:=replace(definition,'WHERE e.status=''active''','WHERE e.status=''active'' AND e.employment_type=''employee'''); END IF;
 EXECUTE definition;
END $$;
COMMIT;
