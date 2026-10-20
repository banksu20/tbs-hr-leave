-- Inclusive internship dates determine duration; no programme selection.
BEGIN;
CREATE OR REPLACE FUNCTION tbs_intern_months(first_day date,last_day date) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE finish date:=last_day+1; whole integer; anchor date; next_anchor date;
BEGIN
 IF first_day IS NULL OR last_day IS NULL OR last_day<first_day THEN RETURN NULL; END IF;
 whole:=(extract(year FROM finish)-extract(year FROM first_day))::integer*12+(extract(month FROM finish)-extract(month FROM first_day))::integer;
 anchor:=(first_day+make_interval(months=>whole))::date;
 IF anchor>finish THEN whole:=whole-1;anchor:=(first_day+make_interval(months=>whole))::date;END IF;
 next_anchor:=(first_day+make_interval(months=>whole+1))::date;
 RETURN whole+(finish-anchor)::numeric/(next_anchor-anchor);
END $$;
ALTER TABLE tbs_intern_terms DROP CONSTRAINT IF EXISTS tbs_intern_terms_months_check;
ALTER TABLE tbs_intern_terms ALTER COLUMN months TYPE numeric USING months::numeric;
CREATE OR REPLACE FUNCTION tbs_calculate_intern_duration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.months:=tbs_intern_months(NEW.start_date,NEW.end_date);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_calculate_intern_duration ON tbs_intern_terms;
CREATE TRIGGER tbs_calculate_intern_duration BEFORE INSERT OR UPDATE ON tbs_intern_terms FOR EACH ROW EXECUTE FUNCTION tbs_calculate_intern_duration();
UPDATE tbs_intern_terms SET months=tbs_intern_months(start_date,end_date);
DO $$ DECLARE def text; fn text; BEGIN
 -- Old clients may send a programme; the server deliberately ignores it.
 FOREACH fn IN ARRAY ARRAY['tbs_registration(jsonb)','tbs_policy_admin(jsonb)'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(fn)) INTO def;
  def:=replace(def,'(payload->>''months'')::integer','NULL::numeric');
  EXECUTE def;
 END LOOP;
 SELECT pg_get_functiondef('tbs_leave_balance(text,integer,text,date[],numeric,integer)'::regprocedure) INTO def;
 def:=regexp_replace(def,'allowance:=CASE[^;]+;',
  'allowance:=CASE WHEN kind=''personal'' THEN 3 WHEN kind=''sick'' THEN round(tbs_intern_months(terms.start_date,terms.end_date),2) WHEN kind=''annual'' THEN round(tbs_intern_months(terms.start_date,terms.end_date)/2,2) END;');
 IF strpos(def,'round(tbs_intern_months')=0 THEN RAISE EXCEPTION 'Intern allowance update failed'; END IF;
 EXECUTE def;
END $$;
COMMIT;
