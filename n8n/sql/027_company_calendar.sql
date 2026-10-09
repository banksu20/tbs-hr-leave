BEGIN;
CREATE TABLE IF NOT EXISTS tbs_calendar_years(year integer PRIMARY KEY CHECK(year BETWEEN 2000 AND 2200),confirmed_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION tbs_company_calendar(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; yr integer:=(payload->>'year')::int; actual text; BEGIN
 IF yr IS NULL OR yr NOT BETWEEN 2000 AND 2200 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid year'); END IF;
 PERFORM pg_advisory_xact_lock(27100,yr);
 SELECT md5(COALESCE(string_agg(day::text||working::text||note,'|' ORDER BY day),'')) INTO actual FROM tbs_work_calendar WHERE extract(year FROM day)=yr;
 IF payload->>'action'='save' THEN
  SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  IF payload->>'revision' IS DISTINCT FROM actual THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Calendar changed. Refresh before saving.'); END IF;
  IF jsonb_typeof(payload->'holidays')<>'array' OR jsonb_array_length(payload->'holidays')>366 OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'holidays') h WHERE extract(year FROM (h->>'date')::date)<>yr OR length(btrim(COALESCE(h->>'name','')))=0) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check holiday dates and names'); END IF;
  DELETE FROM tbs_work_calendar WHERE extract(year FROM day)=yr;
  INSERT INTO tbs_work_calendar(day,working,note) SELECT (h->>'date')::date,false,h->>'name' FROM jsonb_array_elements(payload->'holidays') h;
  INSERT INTO tbs_calendar_years VALUES(yr,now()) ON CONFLICT(year) DO UPDATE SET confirmed_at=now();
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'company-holidays',yr::text);
  SELECT md5(COALESCE(string_agg(day::text||working::text||note,'|' ORDER BY day),'')) INTO actual FROM tbs_work_calendar WHERE extract(year FROM day)=yr;
 END IF;
 RETURN jsonb_build_object('ok',true,'confirmed',EXISTS(SELECT 1 FROM tbs_calendar_years WHERE year=yr),'revision',actual,'holidays',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',day,'name',note,'localName',note) ORDER BY day) FROM tbs_work_calendar WHERE extract(year FROM day)=yr AND NOT working),'[]'::jsonb));
END $$;
-- Missing company calendars must not silently become a Monday-Friday-only policy.
CREATE OR REPLACE FUNCTION tbs_working_day(d date) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN IF NOT EXISTS(SELECT 1 FROM tbs_calendar_years WHERE year=extract(year FROM d)::int) THEN RAISE EXCEPTION 'HR must confirm the company holiday calendar for % first.',extract(year FROM d)::int USING ERRCODE='P2001';END IF;
 RETURN COALESCE((SELECT working FROM tbs_work_calendar WHERE day=d),extract(isodow FROM d) BETWEEN 1 AND 5);END $$;
DO $$ DECLARE def text; BEGIN SELECT pg_get_functiondef('tbs_leave_policy_preview(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'EXCEPTION WHEN invalid_text_representation','EXCEPTION WHEN SQLSTATE ''P2001'' THEN RETURN jsonb_build_object(''ok'',false,''statusCode'',409,''error'',SQLERRM); WHEN invalid_text_representation');EXECUTE def;END $$;
CREATE OR REPLACE FUNCTION tbs_medical_certificate(uid text,candidate date[],per_day numeric DEFAULT 1) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE sick_dates date[]; candidate_day date; cursor_day date; window_days date[]; i int; j int; run int;
BEGIN
 IF candidate IS NULL OR cardinality(candidate)=0 THEN RETURN false;END IF;
 SELECT array_agg(d) INTO sick_dates FROM (
 SELECT d,sum(amount) amount FROM (
 SELECT d,r.leave_days/cardinality(ds.dates) amount FROM leave_requests r CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) dates) ds CROSS JOIN LATERAL unnest(ds.dates) d WHERE r.user_id=tbs_resolve_employee(uid) AND r.leave_type='sick' AND r.status<>'Rejected'
 UNION ALL SELECT unnest(candidate),per_day) s GROUP BY d) totals WHERE amount>=CASE WHEN (SELECT certificate_half_days FROM tbs_leave_policy_settings WHERE singleton) THEN .25 ELSE 1 END;
 FOREACH candidate_day IN ARRAY candidate LOOP
  IF NOT tbs_working_day(candidate_day) THEN CONTINUE;END IF;
  window_days:=ARRAY[candidate_day];cursor_day:=candidate_day;
  FOR i IN 1..2 LOOP cursor_day:=cursor_day-1;WHILE NOT tbs_working_day(cursor_day) LOOP cursor_day:=cursor_day-1;END LOOP;window_days:=array_prepend(cursor_day,window_days);END LOOP;
  cursor_day:=candidate_day;FOR i IN 1..2 LOOP cursor_day:=cursor_day+1;WHILE NOT tbs_working_day(cursor_day) LOOP cursor_day:=cursor_day+1;END LOOP;window_days:=array_append(window_days,cursor_day);END LOOP;
  run:=0;FOR j IN 1..5 LOOP IF window_days[j]=ANY(sick_dates) THEN run:=run+1;ELSE run:=0;END IF;IF run>=3 THEN RETURN true;END IF;END LOOP;
 END LOOP;RETURN false;
END $$;
COMMIT;
