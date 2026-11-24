BEGIN;
ALTER TABLE tbs_trip_receipts ADD COLUMN IF NOT EXISTS read_is_receipt boolean;
ALTER TABLE tbs_trip_receipts ADD COLUMN IF NOT EXISTS read_time time;
ALTER TABLE tbs_trip_receipts ADD COLUMN IF NOT EXISTS read_kind text CHECK(read_kind IN ('toll','parking','grab','taxi','other'));
ALTER TABLE tbs_trip_receipts ADD COLUMN IF NOT EXISTS read_merchant text CHECK(length(read_merchant)<=120);
ALTER TABLE tbs_trip_receipts ADD COLUMN IF NOT EXISTS read_ref text CHECK(length(read_ref)<=60);
ALTER TABLE tbs_trip_receipts ADD COLUMN IF NOT EXISTS content_md5 text;
UPDATE tbs_trip_receipts SET content_md5=md5(content) WHERE content_md5 IS NULL;
CREATE INDEX IF NOT EXISTS tbs_trip_receipts_md5 ON tbs_trip_receipts(content_md5);
CREATE INDEX IF NOT EXISTS tbs_trip_receipts_ref ON tbs_trip_receipts(read_ref) WHERE read_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION tbs_trip_receipt_md5() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.content_md5:=md5(NEW.content); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tbs_trip_receipt_md5 ON tbs_trip_receipts;
CREATE TRIGGER tbs_trip_receipt_md5 BEFORE INSERT OR UPDATE OF content ON tbs_trip_receipts FOR EACH ROW EXECUTE FUNCTION tbs_trip_receipt_md5();

CREATE OR REPLACE FUNCTION tbs_receipt_duplicate(r tbs_trip_receipts) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM tbs_trip_receipts o JOIN tbs_trips ot ON ot.id=o.trip_id
  WHERE o.id<>r.id AND ot.status<>'cancelled'
   AND (o.content_md5=r.content_md5
    OR (r.read_ref IS NOT NULL AND o.read_ref=r.read_ref AND o.read_amount IS NOT DISTINCT FROM r.read_amount AND o.read_date IS NOT DISTINCT FROM r.read_date)));
$$;

CREATE OR REPLACE FUNCTION tbs_receipt_wrong_kind(mode text,r tbs_trip_receipts) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (r.read_kind IS NOT NULL AND r.read_kind<>'other' AND r.read_kind<>r.kind)
  OR (mode='car' AND COALESCE(r.read_kind,r.kind) IN ('grab','taxi'))
  OR (mode='grab' AND COALESCE(r.read_kind,r.kind) IN ('taxi','parking'))
  OR (mode='taxi' AND COALESCE(r.read_kind,r.kind) IN ('grab','parking'));
$$;

CREATE OR REPLACE FUNCTION tbs_receipt_wrong_time(t tbs_trips,r tbs_trip_receipts) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT r.read_time IS NOT NULL AND COALESCE(r.read_date,t.trip_date)=t.trip_date
  AND ((t.trip_date+r.read_time) AT TIME ZONE 'Asia/Bangkok')
   NOT BETWEEN (SELECT min(p.recorded_at) FROM tbs_trip_points p WHERE p.trip_id=t.id)-interval '30 minutes'
   AND GREATEST((SELECT max(p.recorded_at) FROM tbs_trip_points p WHERE p.trip_id=t.id),COALESCE(t.submitted_at,now()))+interval '30 minutes';
$$;

CREATE OR REPLACE FUNCTION tbs_trip_flags(t tbs_trips) RETURNS text[] LANGUAGE sql STABLE AS $$
 SELECT array_remove(ARRAY[
  CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_points p WHERE p.trip_id=t.id AND p.accuracy_m>100) THEN 'gps_weak' END,
  CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_legs l JOIN tbs_trip_points a ON a.id=l.from_point JOIN tbs_trip_points b ON b.id=l.to_point
   WHERE l.trip_id=t.id AND l.route_km>=1 AND l.route_km/GREATEST(extract(epoch FROM b.recorded_at-a.recorded_at)/3600,1.0/60)>120) THEN 'too_fast' END,
  CASE WHEN (SELECT COALESCE(sum(km),0) FROM tbs_trip_legs WHERE trip_id=t.id)>(SELECT trip_km_cap FROM tbs_travel_settings WHERE singleton) THEN 'over_cap' END,
  CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_points p JOIN tbs_trip_stops s ON s.id=p.stop_id WHERE p.trip_id=t.id AND p.kind='arrive' AND tbs_geo_m(p.lat,p.lng,s.lat,s.lng)>1000) THEN 'far_from_client' END,
  CASE WHEN t.mode IN ('grab','taxi') AND (SELECT COALESCE(sum(route_km),0) FROM tbs_trip_legs WHERE trip_id=t.id)>0
   AND (SELECT COALESCE(sum(amount),0) FROM tbs_trip_receipts WHERE trip_id=t.id AND kind IN ('grab','taxi'))>3*t.rate*(SELECT sum(route_km) FROM tbs_trip_legs WHERE trip_id=t.id) THEN 'fare_high' END,
  CASE WHEN NOT EXISTS(SELECT 1 FROM tbs_trip_points p WHERE p.trip_id=t.id AND p.kind='arrive') THEN 'no_checkin' END,
  CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_receipts r WHERE r.trip_id=t.id AND r.read_is_receipt IS FALSE) THEN 'receipt_not_receipt' END,
  CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_receipts r WHERE r.trip_id=t.id AND r.read_date IS NOT NULL AND r.read_date<>t.trip_date) THEN 'receipt_date' END,
  CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_receipts r WHERE r.trip_id=t.id AND tbs_receipt_wrong_time(t,r)) THEN 'receipt_time' END,
  CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_receipts r WHERE r.trip_id=t.id AND tbs_receipt_duplicate(r)) THEN 'receipt_duplicate' END,
  CASE WHEN EXISTS(SELECT 1 FROM tbs_trip_receipts r WHERE r.trip_id=t.id AND tbs_receipt_wrong_kind(t.mode,r)) THEN 'receipt_kind' END
 ],NULL);
$$;

DO $$
DECLARE d text; n integer;
 old_cols text:='INSERT INTO tbs_trip_receipts(trip_id,kind,mime,content,read_amount,read_date,amount,edited,needs_original)';
 old_end text:='payload->>''kind'' IN (''toll'',''parking'',''other''));';
 old_json text:='''readDate'',r.read_date,';
BEGIN
 d:=pg_get_functiondef('tbs_travel_employee(text,jsonb)'::regprocedure);
 IF position('read_is_receipt' IN d)=0 THEN
  n:=(length(d)-length(replace(d,old_cols,'')))/length(old_cols)+(length(d)-length(replace(d,old_end,'')))/length(old_end);
  IF n<>2 THEN RAISE EXCEPTION 'tbs_travel_employee receipt insert changed; patch not applied'; END IF;
  d:=replace(d,old_cols,replace(old_cols,'needs_original)','needs_original,read_is_receipt,read_time,read_kind,read_merchant,read_ref)'));
  d:=replace(d,old_end,'payload->>''kind'' IN (''toll'',''parking'',''other''),
    CASE WHEN payload->>''readIsReceipt'' IN (''true'',''false'') THEN (payload->>''readIsReceipt'')::boolean END,
    CASE WHEN COALESCE(payload->>''readTime'','''')~''^([01][0-9]|2[0-3]):[0-5][0-9]$'' THEN (payload->>''readTime'')::time END,
    CASE WHEN payload->>''readKind'' IN (''toll'',''parking'',''grab'',''taxi'',''other'') THEN payload->>''readKind'' END,
    NULLIF(left(btrim(COALESCE(payload->>''readMerchant'','''')),120),''''),
    NULLIF(left(btrim(COALESCE(payload->>''readRef'','''')),60),''''));');
  EXECUTE d;
 END IF;
 d:=pg_get_functiondef('tbs_trip_json(tbs_trips,boolean)'::regprocedure);
 IF position('readIsReceipt' IN d)=0 THEN
  IF position(old_json IN d)=0 THEN RAISE EXCEPTION 'tbs_trip_json receipts changed; patch not applied'; END IF;
  d:=replace(d,old_json,old_json||'''readTime'',to_char(r.read_time,''HH24:MI''),''readIsReceipt'',r.read_is_receipt,''readKind'',r.read_kind,''readMerchant'',r.read_merchant,''readRef'',r.read_ref,''duplicate'',tbs_receipt_duplicate(r),''wrongTime'',tbs_receipt_wrong_time(t,r),''wrongKind'',tbs_receipt_wrong_kind(t.mode,r),');
  EXECUTE d;
 END IF;
END $$;
COMMIT;
