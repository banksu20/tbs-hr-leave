-- Quota exceptions are scoped to authenticated dashboard record creation/editing.
BEGIN;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS quota_override boolean NOT NULL DEFAULT false;
DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_quota_override(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_quota_override;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; uid text; result jsonb; previous text:=COALESCE(current_setting('app.tbs_quota_override_uid',true),'');
BEGIN
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NOT NULL AND actor.role IN ('admin','ceo','hr') AND
 (payload->>'operation'='leave-create' OR (payload->>'operation'='leave-update' AND COALESCE(payload->'body'->>'action','')='')) THEN
  IF payload->>'operation'='leave-create' THEN uid:=tbs_resolve_employee(payload->'body'->>'userId');
  ELSE SELECT user_id INTO uid FROM leave_requests WHERE id=(payload->'body'->>'id')::integer; END IF;
  IF actor.role='hr' AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern') THEN uid:=NULL; END IF;
 END IF;
 PERFORM set_config('app.tbs_quota_override_uid',COALESCE(uid,''),true);
 result:=tbs_dashboard_auth_before_quota_override(payload);
 PERFORM set_config('app.tbs_quota_override_uid',previous,true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tbs_quota_override_uid',previous,true);RAISE;
END $$;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_intern_request_guard()'::regprocedure) INTO def;
 IF strpos(def,'app.tbs_quota_override_uid')=0 THEN
 def:=replace(def,' IF NOT COALESCE((balance->>''allowed'')::boolean,false) THEN', $patch$
 IF NOT COALESCE((balance->>'allowed')::boolean,false)
 AND current_setting('app.tbs_quota_override_uid',true)=NEW.user_id
 AND COALESCE((balance->>'known')::boolean,false)
 AND EXISTS(SELECT 1 FROM tbs_intern_terms t WHERE t.user_id=NEW.user_id AND NOT EXISTS(SELECT 1 FROM unnest(dates) d WHERE d<t.start_date OR d>t.end_date)) THEN
  NEW.quota_override:=true;RETURN NEW;
 END IF;
 IF NOT COALESCE((balance->>'allowed')::boolean,false) THEN$patch$);
 IF strpos(def,'NEW.quota_override:=true')=0 THEN RAISE EXCEPTION 'Intern guard not found';END IF;EXECUTE def;
 END IF;
 SELECT pg_get_functiondef('tbs_enforce_leave_policy()'::regprocedure) INTO def;
 IF strpos(def,'app.tbs_quota_override_uid')=0 THEN
 def:=replace(def,'  IF NOT (balance->>''allowed'')::boolean THEN', $patch$
  IF NOT (balance->>'allowed')::boolean AND (balance->>'known')::boolean
   AND current_setting('app.tbs_quota_override_uid',true)=NEW.user_id THEN
   NEW.quota_override:=true;
  ELSIF NOT (balance->>'allowed')::boolean THEN$patch$);
 IF strpos(def,'NEW.quota_override:=true')=0 THEN RAISE EXCEPTION 'Full-time guard not found';END IF;EXECUTE def;
 END IF;
END $$;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_policy_admin(jsonb)'::regprocedure) INTO def;
 IF strpos(def, 'internshipBalances')=0 THEN
  IF strpos(def,'jsonb_agg(to_jsonb(t)')=0 THEN RAISE EXCEPTION 'Intern terms list shape changed'; END IF;
  def:=replace(def,'jsonb_agg(to_jsonb(t)', $patch$jsonb_agg(to_jsonb(t)||jsonb_build_object('internshipBalances',jsonb_build_array(tbs_leave_balance(t.user_id,extract(year FROM t.start_date)::integer,'sick'),tbs_leave_balance(t.user_id,extract(year FROM t.start_date)::integer,'annual'),tbs_leave_balance(t.user_id,extract(year FROM t.start_date)::integer,'personal')))$patch$);
  EXECUTE def;
 END IF;
END $$;
COMMIT;
