BEGIN;
-- Floor actual entitlements, preserving all recorded leave and full-time rules.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_leave_balance(text,integer,text,date[],numeric,integer)'::regprocedure) INTO def;
 def:=replace(def,'round(tbs_intern_months(terms.start_date,terms.end_date),2)',
                  'floor(tbs_intern_months(terms.start_date,terms.end_date)*2)/2');
 def:=replace(def,'round(tbs_intern_months(terms.start_date,terms.end_date)/2,2)',
                  'floor(tbs_intern_months(terms.start_date,terms.end_date))/2');
 IF strpos(def,'floor(tbs_intern_months(terms.start_date,terms.end_date)*2)/2')=0
 OR strpos(def,'floor(tbs_intern_months(terms.start_date,terms.end_date))/2')=0
 THEN RAISE EXCEPTION 'Intern half-day allowance update failed'; END IF;
 EXECUTE def;
END $$;
COMMIT;
