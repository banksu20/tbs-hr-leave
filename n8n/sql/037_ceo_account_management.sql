BEGIN;
-- CEO has the same account-management authority as Admin; HR remains restricted.
DO $$ DECLARE fn text; def text; BEGIN
 FOREACH fn IN ARRAY ARRAY['tbs_dashboard_auth(jsonb)','tbs_dashboard_auth_before_intern_delete(jsonb)'] LOOP
  IF to_regprocedure(fn) IS NULL THEN CONTINUE; END IF;
  SELECT pg_get_functiondef(to_regprocedure(fn)) INTO def;
  def:=replace(def,'actor.role<>''admin''','actor.role NOT IN (''admin'',''ceo'')');
  def:=replace(def,'Admin access required','Admin or CEO access required');
  def:=replace(def,'Admin session is no longer valid','Management session is no longer valid');
  def:=replace(def,'payload->>''role''<>''admin''','payload->>''role'' IS DISTINCT FROM actor.role');
  def:=replace(def,'You cannot disable or demote your own admin account','You cannot disable or change the role of your own management account');
  EXECUTE def;
 END LOOP;
END $$;
COMMIT;
