BEGIN;
ALTER TABLE tbs_dashboard_accounts DROP CONSTRAINT IF EXISTS tbs_dashboard_accounts_role_check;
ALTER TABLE tbs_dashboard_accounts ADD CONSTRAINT tbs_dashboard_accounts_role_check CHECK(role IN ('admin','ceo','hr','accounting'));

DO $$
DECLARE f record; d text; n integer:=0;
 old_roles text:='payload->>''role'' NOT IN (''admin'',''ceo'',''hr'')';
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=current_schema() AND p.proname LIKE 'tbs_dashboard_auth%' AND position(old_roles IN p.prosrc)>0 LOOP
  d:=replace(pg_get_functiondef(f.oid),old_roles,'payload->>''role'' NOT IN (''admin'',''ceo'',''hr'',''accounting'')');
  EXECUTE d; n:=n+1;
 END LOOP;
 IF n=0 AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE proname LIKE 'tbs_dashboard_auth%' AND position('''hr'',''accounting'')' IN prosrc)>0) THEN
  RAISE EXCEPTION 'account role check changed; accounting role not added';
 END IF;
END $$;

DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_accounting(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_accounting;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE op text:=payload->>'operation'; actor tbs_dashboard_accounts%ROWTYPE; BEGIN
 IF op IN ('bootstrap','login-start','login-finish','logout','session') THEN RETURN tbs_dashboard_auth_before_accounting(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.role='accounting' AND op NOT IN ('travel-trips','travel-trip','travel-receipt','travel-mark','travel-payout','travel-payout-paid') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Accounting can only open travel claims.');
 END IF;
 RETURN tbs_dashboard_auth_before_accounting(payload);
END $$;
COMMIT;
