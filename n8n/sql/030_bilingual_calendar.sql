BEGIN;
ALTER TABLE tbs_work_calendar ADD COLUMN IF NOT EXISTS local_name text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION tbs_company_calendar(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; yr integer:=(payload->>'year')::int; actual text; BEGIN
 IF yr IS NULL OR yr NOT BETWEEN 2000 AND 2200 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid year'); END IF;
 PERFORM pg_advisory_xact_lock(27100,yr);
 SELECT md5(COALESCE(string_agg(day::text||working::text||COALESCE(note,'')||COALESCE(local_name,''),'|' ORDER BY day),'')) INTO actual FROM tbs_work_calendar WHERE extract(year FROM day)=yr;
 IF payload->>'action'='save' THEN
  SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  IF payload->>'revision' IS DISTINCT FROM actual THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Calendar changed. Refresh before saving.'); END IF;
  IF jsonb_typeof(payload->'holidays')<>'array' OR jsonb_array_length(payload->'holidays')>366 OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'holidays') h WHERE extract(year FROM (h->>'date')::date)<>yr OR length(btrim(COALESCE(h->>'name','')))=0) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check holiday dates and names'); END IF;
  DELETE FROM tbs_work_calendar WHERE extract(year FROM day)=yr;
  INSERT INTO tbs_work_calendar(day,working,note,local_name) SELECT (h->>'date')::date,false,h->>'name',COALESCE(h->>'localName','') FROM jsonb_array_elements(payload->'holidays') h;
  INSERT INTO tbs_calendar_years VALUES(yr,now()) ON CONFLICT(year) DO UPDATE SET confirmed_at=now();
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'company-holidays',yr::text);
  SELECT md5(COALESCE(string_agg(day::text||working::text||COALESCE(note,'')||COALESCE(local_name,''),'|' ORDER BY day),'')) INTO actual FROM tbs_work_calendar WHERE extract(year FROM day)=yr;
 END IF;
 RETURN jsonb_build_object('ok',true,'confirmed',EXISTS(SELECT 1 FROM tbs_calendar_years WHERE year=yr),'revision',actual,'holidays',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',day,'name',note,'localName',COALESCE(NULLIF(local_name,''),note)) ORDER BY day) FROM tbs_work_calendar WHERE extract(year FROM day)=yr AND NOT working),'[]'::jsonb));
END $$;
COMMIT;
