-- Extend the authenticated intern terms list with approved usage across the whole term.
BEGIN;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_policy_admin(jsonb)'::regprocedure) INTO def;
 IF strpos(def, 'universityApproved')=0 THEN
  IF strpos(def,'jsonb_agg(to_jsonb(t))')=0 THEN RAISE EXCEPTION 'Intern terms list shape changed'; END IF;
  def:=replace(def,'jsonb_agg(to_jsonb(t))', $replacement$jsonb_agg(to_jsonb(t)||jsonb_build_object('universityApproved',tbs_leave_balance(t.user_id,extract(year FROM t.start_date)::integer,'university')->'approved'))$replacement$);
  EXECUTE def;
 END IF;
END $$;
COMMIT;
