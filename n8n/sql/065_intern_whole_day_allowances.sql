BEGIN;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_leave_balance(text,integer,text,date[],numeric,integer)'::regprocedure) INTO def;
 IF strpos(def,'ceil(floor(tbs_intern_months(terms.start_date,terms.end_date)')=0 THEN
  def:=replace(def,'floor(tbs_intern_months(terms.start_date,terms.end_date)*2)/2',
                   'ceil(floor(tbs_intern_months(terms.start_date,terms.end_date)*2)/2)');
  def:=replace(def,'floor(tbs_intern_months(terms.start_date,terms.end_date))/2',
                   'ceil(floor(tbs_intern_months(terms.start_date,terms.end_date))/2)');
 END IF;
 IF strpos(def,'ceil(floor(tbs_intern_months(terms.start_date,terms.end_date)*2)/2)')=0
 OR strpos(def,'ceil(floor(tbs_intern_months(terms.start_date,terms.end_date))/2)')=0
 THEN RAISE EXCEPTION 'Intern whole-day allowance update failed'; END IF;
 EXECUTE def;
END $$;
COMMIT;
