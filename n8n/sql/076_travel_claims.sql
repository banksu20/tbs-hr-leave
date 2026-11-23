BEGIN;
CREATE TABLE IF NOT EXISTS tbs_travel_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 office_lat numeric(9,6) CHECK(office_lat BETWEEN -90 AND 90),
 office_lng numeric(9,6) CHECK(office_lng BETWEEN -180 AND 180),
 office_radius_m integer NOT NULL DEFAULT 200 CHECK(office_radius_m BETWEEN 50 AND 2000),
 car_rate numeric(6,2) NOT NULL DEFAULT 7 CHECK(car_rate>0 AND car_rate<=100),
 home_cutoff time NOT NULL DEFAULT '10:00',
 trip_km_cap numeric(7,2) NOT NULL DEFAULT 200 CHECK(trip_km_cap>0),
 accounting_email text CHECK(accounting_email IS NULL OR accounting_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
 eligible_departments text[] NOT NULL DEFAULT '{Sale,Sales}',
 last_daily_date date,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
INSERT INTO tbs_travel_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_travel_access(
 user_id text PRIMARY KEY REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 allowed boolean NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tbs_trips(
 id serial PRIMARY KEY,
 user_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 trip_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date,
 purpose text NOT NULL CHECK(purpose IN ('deal','care')),
 deal_ref text CHECK(length(deal_ref)<=120),
 mode text NOT NULL CHECK(mode IN ('car','grab','taxi')),
 start_from text NOT NULL CHECK(start_from IN ('office','home')),
 appointment_at time,
 rate numeric(6,2) NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','submitted','flagged','approved','rejected','paid','cancelled')),
 flags text[] NOT NULL DEFAULT '{}',
 auto_closed boolean NOT NULL DEFAULT false,
 submitted_at timestamptz,
 decided_at timestamptz,
 decided_by text,
 decision_note text,
 paid_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tbs_trips_one_open ON tbs_trips(user_id) WHERE status='open';
CREATE TABLE IF NOT EXISTS tbs_trip_stops(
 id serial PRIMARY KEY,
 trip_id integer NOT NULL REFERENCES tbs_trips(id) ON DELETE CASCADE,
 seq integer NOT NULL,
 client_name text NOT NULL CHECK(length(btrim(client_name)) BETWEEN 1 AND 160),
 label text NOT NULL DEFAULT '' CHECK(length(label)<=300),
 lat numeric(9,6) NOT NULL,
 lng numeric(9,6) NOT NULL,
 UNIQUE(trip_id,seq)
);
CREATE TABLE IF NOT EXISTS tbs_trip_points(
 id serial PRIMARY KEY,
 trip_id integer NOT NULL REFERENCES tbs_trips(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('start_office','start_home','arrive','return_office')),
 stop_id integer REFERENCES tbs_trip_stops(id) ON DELETE CASCADE,
 lat numeric(9,6) NOT NULL,
 lng numeric(9,6) NOT NULL,
 accuracy_m numeric(8,1),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tbs_trip_legs(
 id serial PRIMARY KEY,
 trip_id integer NOT NULL REFERENCES tbs_trips(id) ON DELETE CASCADE,
 from_point integer NOT NULL REFERENCES tbs_trip_points(id) ON DELETE CASCADE,
 to_point integer NOT NULL UNIQUE REFERENCES tbs_trip_points(id) ON DELETE CASCADE,
 route_km numeric(8,2) NOT NULL CHECK(route_km>=0),
 km numeric(8,2) NOT NULL CHECK(km>=0),
 amount numeric(10,2) NOT NULL CHECK(amount>=0),
 capped boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS tbs_trip_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 trip_id integer NOT NULL REFERENCES tbs_trips(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('toll','parking','grab','taxi','other')),
 mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','application/pdf')),
 content bytea NOT NULL,
 read_amount numeric(10,2),
 read_date date,
 amount numeric(10,2) NOT NULL CHECK(amount>0 AND amount<=100000),
 edited boolean NOT NULL DEFAULT false,
 needs_original boolean NOT NULL DEFAULT false,
 original_received_at timestamptz,
 reminded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tbs_trip_links(
 trip_id integer PRIMARY KEY REFERENCES tbs_trips(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION tbs_geo_m(lat1 numeric,lng1 numeric,lat2 numeric,lng2 numeric) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
 SELECT round((2*6371000*asin(sqrt(power(sin(radians((lat2-lat1)::float8)/2),2)+cos(radians(lat1::float8))*cos(radians(lat2::float8))*power(sin(radians((lng2-lng1)::float8)/2),2))))::numeric,1);
$$;
CREATE OR REPLACE FUNCTION tbs_travel_eligible(uid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT allowed FROM tbs_travel_access WHERE user_id=uid),
  EXISTS(SELECT 1 FROM tbs_employees e,tbs_travel_settings s WHERE e.user_id=uid AND s.singleton AND COALESCE(e.status,'active')='active'
   AND lower(btrim(COALESCE(e.department,''))) IN (SELECT lower(x) FROM unnest(s.eligible_departments) x)));
$$;
CREATE OR REPLACE FUNCTION tbs_trip_json(t tbs_trips,with_detail boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',t.id,'date',t.trip_date,'purpose',t.purpose,'dealRef',t.deal_ref,'mode',t.mode,'startFrom',t.start_from,
  'appointment',to_char(t.appointment_at,'HH24:MI'),'rate',t.rate,'status',t.status,'flags',to_jsonb(t.flags),'autoClosed',t.auto_closed,
  'submittedAt',t.submitted_at,'decidedAt',t.decided_at,'decidedBy',t.decided_by,'decisionNote',t.decision_note,'paidAt',t.paid_at,
  'clients',(SELECT COALESCE(jsonb_agg(s.client_name ORDER BY s.seq),'[]'::jsonb) FROM tbs_trip_stops s WHERE s.trip_id=t.id),
  'km',(SELECT COALESCE(sum(km),0) FROM tbs_trip_legs WHERE trip_id=t.id),
  'kmAmount',(SELECT COALESCE(sum(amount),0) FROM tbs_trip_legs WHERE trip_id=t.id),
  'receiptAmount',(SELECT COALESCE(sum(amount),0) FROM tbs_trip_receipts WHERE trip_id=t.id),
  'total',(SELECT COALESCE(sum(amount),0) FROM tbs_trip_legs WHERE trip_id=t.id)+(SELECT COALESCE(sum(amount),0) FROM tbs_trip_receipts WHERE trip_id=t.id),
  'originalsWaiting',(SELECT count(*) FROM tbs_trip_receipts WHERE trip_id=t.id AND needs_original AND original_received_at IS NULL))
 ||CASE WHEN with_detail THEN jsonb_build_object(
  'stops',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'seq',s.seq,'clientName',s.client_name,'label',s.label,'lat',s.lat,'lng',s.lng,
    'arrivedAt',(SELECT p.recorded_at FROM tbs_trip_points p WHERE p.stop_id=s.id AND p.kind='arrive')) ORDER BY s.seq),'[]'::jsonb) FROM tbs_trip_stops s WHERE s.trip_id=t.id),
  'points',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'stopId',p.stop_id,'lat',p.lat,'lng',p.lng,'accuracy',p.accuracy_m,'at',p.recorded_at) ORDER BY p.id),'[]'::jsonb) FROM tbs_trip_points p WHERE p.trip_id=t.id),
  'legs',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'from',l.from_point,'to',l.to_point,'routeKm',l.route_km,'km',l.km,'amount',l.amount,'capped',l.capped) ORDER BY l.id),'[]'::jsonb) FROM tbs_trip_legs l WHERE l.trip_id=t.id),
  'receipts',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'mime',r.mime,'readAmount',r.read_amount,'readDate',r.read_date,'amount',r.amount,'edited',r.edited,
    'needsOriginal',r.needs_original,'originalReceivedAt',r.original_received_at,'createdAt',r.created_at) ORDER BY r.created_at),'[]'::jsonb) FROM tbs_trip_receipts r WHERE r.trip_id=t.id))
 ELSE '{}'::jsonb END;
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
  CASE WHEN NOT EXISTS(SELECT 1 FROM tbs_trip_points p WHERE p.trip_id=t.id AND p.kind='arrive') THEN 'no_checkin' END
 ],NULL);
$$;
CREATE OR REPLACE FUNCTION tbs_trip_link(tid integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE token text:=gen_random_uuid()::text; BEGIN
 INSERT INTO tbs_trip_links(trip_id,token_hash,expires_at) VALUES(tid,tbs_token_hash(token),now()+interval '90 days')
 ON CONFLICT(trip_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=now();
 RETURN (SELECT app_url FROM tbs_email_fallback_settings WHERE singleton)||'/travel-review?id='||tid||'&t='||token;
END $$;
CREATE OR REPLACE FUNCTION tbs_trip_notice(t tbs_trips) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j jsonb:=tbs_trip_json(t,false); BEGIN
 IF t.user_id !~ '^U[0-9a-f]{32}$' THEN RETURN; END IF;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',t.user_id,jsonb_build_object('to',t.user_id,'messages',jsonb_build_array(jsonb_build_object('type','flex',
  'altText',left('Travel claim / เบิกค่าเดินทาง: '||(j->>'total')||' THB',300),
  'contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','spacing','sm','contents',jsonb_build_array(
   jsonb_build_object('type','text','text','สรุปทริป / Trip summary','weight','bold','color','#0E7490','size','sm'),
   jsonb_build_object('type','text','text',left(COALESCE((SELECT string_agg(x,', ') FROM jsonb_array_elements_text(j->'clients') x),'-'),200),'weight','bold','size','md','wrap',true),
   jsonb_build_object('type','text','text',(j->>'km')||' km · '||(j->>'total')||' บาท / THB','size','sm','color','#334155'),
   jsonb_build_object('type','text','text',CASE WHEN t.status='flagged' THEN 'รอหัวหน้าตรวจ / Waiting for review' ELSE 'ส่งบัญชีแล้ว / Sent to accounting' END,'size','sm','color',CASE WHEN t.status='flagged' THEN '#B45309' ELSE '#047857' END,'wrap',true))
   ||CASE WHEN (j->>'originalsWaiting')::int>0 THEN jsonb_build_array(jsonb_build_object('type','text','text','ส่งใบเสร็จตัวจริงให้บัญชีภายใน 7 วัน / Hand paper receipts to accounting within 7 days','size','xs','color','#B45309','wrap',true)) ELSE '[]'::jsonb END))))));
END $$;
CREATE OR REPLACE FUNCTION tbs_trip_finish(tid integer,auto boolean) RETURNS tbs_trips LANGUAGE plpgsql AS $$
DECLARE t tbs_trips%ROWTYPE; f text[]; BEGIN
 SELECT * INTO t FROM tbs_trips WHERE id=tid FOR UPDATE;
 IF t.status<>'open' THEN RETURN t; END IF;
 f:=tbs_trip_flags(t);
 UPDATE tbs_trips SET flags=f,auto_closed=auto,submitted_at=now(),status=CASE WHEN cardinality(f)>0 THEN 'flagged' ELSE 'submitted' END WHERE id=tid RETURNING * INTO t;
 PERFORM tbs_trip_notice(t);
 RETURN t;
END $$;

CREATE OR REPLACE FUNCTION tbs_travel_state(uid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('ok',true,'eligible',tbs_travel_eligible(uid),
  'configured',s.office_lat IS NOT NULL AND s.office_lng IS NOT NULL,
  'settings',jsonb_build_object('officeLat',s.office_lat,'officeLng',s.office_lng,'radius',s.office_radius_m,'rate',s.car_rate,'homeCutoff',to_char(s.home_cutoff,'HH24:MI')),
  'trip',(SELECT tbs_trip_json(t,true) FROM tbs_trips t WHERE t.user_id=uid AND t.status='open'),
  'recent',(SELECT COALESCE(jsonb_agg(x.j ORDER BY x.id DESC),'[]'::jsonb) FROM (SELECT t.id,tbs_trip_json(t,false) j FROM tbs_trips t WHERE t.user_id=uid AND t.status NOT IN ('open','cancelled') ORDER BY t.id DESC LIMIT 10) x))
 FROM tbs_travel_settings s WHERE s.singleton;
$$;
CREATE OR REPLACE FUNCTION tbs_travel_coord(v jsonb,lat_key text,lng_key text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_typeof(v->lat_key)='number' AND jsonb_typeof(v->lng_key)='number' AND (v->>lat_key)::numeric BETWEEN -90 AND 90 AND (v->>lng_key)::numeric BETWEEN -180 AND 180;
$$;
CREATE OR REPLACE FUNCTION tbs_travel_employee(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId'); s tbs_travel_settings%ROWTYPE; t tbs_trips%ROWTYPE; st tbs_trip_stops%ROWTYPE;
 last tbs_trip_points%ROWTYPE; p_id integer; km numeric; office_km numeric; capped boolean:=false; dist numeric; appt time; rid uuid; amt numeric; BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Your employee account is not active.');
 END IF;
 SELECT * INTO s FROM tbs_travel_settings WHERE singleton;
 IF operation='travel-state' THEN RETURN tbs_travel_state(uid); END IF;
 IF operation='travel-receipt-image' THEN
  RETURN COALESCE((SELECT jsonb_build_object('ok',true,'mime',r.mime,'content',encode(r.content,'base64')) FROM tbs_trip_receipts r JOIN tbs_trips x ON x.id=r.trip_id
   WHERE x.user_id=uid AND r.id::text=payload->>'receiptId'),jsonb_build_object('ok',false,'statusCode',404,'error','Receipt not found.'));
 END IF;
 IF NOT tbs_travel_eligible(uid) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Travel claims are not open for your account yet.'); END IF;
 IF s.office_lat IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','HR has not set the office location yet.'); END IF;
 IF operation='travel-start' THEN
  IF EXISTS(SELECT 1 FROM tbs_trips WHERE user_id=uid AND status='open') THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You already have a trip in progress.')||tbs_travel_state(uid)-'ok'; END IF;
  IF COALESCE(payload->>'purpose','') NOT IN ('deal','care') OR COALESCE(payload->>'mode','') NOT IN ('car','grab','taxi') OR COALESCE(payload->>'startFrom','') NOT IN ('office','home')
   OR length(btrim(COALESCE(payload->>'clientName','')))NOT BETWEEN 1 AND 160 OR NOT tbs_travel_coord(payload,'destLat','destLng') THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose the client, where you are going and how you travel.');
  END IF;
  IF COALESCE(payload->>'appointment','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Enter the appointment time.'); END IF;
  appt:=(payload->>'appointment')::time;
  IF payload->>'startFrom'='home' AND appt>=s.home_cutoff THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Starting from home is only for appointments before '||to_char(s.home_cutoff,'HH24:MI')||'. Please start from the office.');
  END IF;
  IF payload->>'startFrom'='home' AND NOT tbs_travel_coord(payload,'lat','lng') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Allow location so we can record where you start.'); END IF;
  INSERT INTO tbs_trips(user_id,purpose,deal_ref,mode,start_from,appointment_at,rate)
   VALUES(uid,payload->>'purpose',NULLIF(left(btrim(COALESCE(payload->>'dealRef','')),120),''),payload->>'mode',payload->>'startFrom',appt,s.car_rate) RETURNING * INTO t;
  INSERT INTO tbs_trip_stops(trip_id,seq,client_name,label,lat,lng) VALUES(t.id,1,btrim(payload->>'clientName'),left(COALESCE(payload->>'destLabel',''),300),(payload->>'destLat')::numeric,(payload->>'destLng')::numeric);
  IF t.start_from='home' THEN
   INSERT INTO tbs_trip_points(trip_id,kind,lat,lng,accuracy_m) VALUES(t.id,'start_home',(payload->>'lat')::numeric,(payload->>'lng')::numeric,NULLIF(payload->>'accuracy','')::numeric);
  ELSE
   INSERT INTO tbs_trip_points(trip_id,kind,lat,lng) VALUES(t.id,'start_office',s.office_lat,s.office_lng);
  END IF;
  RETURN tbs_travel_state(uid);
 END IF;
 SELECT * INTO t FROM tbs_trips WHERE id=NULLIF(payload->>'tripId','')::integer AND user_id=uid FOR UPDATE;
 IF t.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Trip not found.'); END IF;
 IF t.status<>'open' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This trip is already closed.')||tbs_travel_state(uid)-'ok'; END IF;
 SELECT * INTO last FROM tbs_trip_points WHERE trip_id=t.id ORDER BY id DESC LIMIT 1;
 IF operation='travel-add-stop' THEN
  IF length(btrim(COALESCE(payload->>'clientName','')))NOT BETWEEN 1 AND 160 OR NOT tbs_travel_coord(payload,'destLat','destLng') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose the client and where you are going.'); END IF;
  IF last.kind='return_office' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You are already back at the office.'); END IF;
  IF (SELECT count(*) FROM tbs_trip_stops WHERE trip_id=t.id)>=10 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','A trip can have up to 10 clients.'); END IF;
  INSERT INTO tbs_trip_stops(trip_id,seq,client_name,label,lat,lng) SELECT t.id,COALESCE(max(seq),0)+1,btrim(payload->>'clientName'),left(COALESCE(payload->>'destLabel',''),300),(payload->>'destLat')::numeric,(payload->>'destLng')::numeric FROM tbs_trip_stops WHERE trip_id=t.id;
  RETURN tbs_travel_state(uid);
 END IF;
 IF operation IN ('travel-arrive','travel-return') THEN
  IF NOT tbs_travel_coord(payload,'lat','lng') OR jsonb_typeof(payload->'km') IS DISTINCT FROM 'number' OR (payload->>'km')::numeric NOT BETWEEN 0 AND 2000 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Location or distance is missing.'); END IF;
  IF NULLIF(payload->>'prevPointId','')::integer IS DISTINCT FROM last.id THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Your trip changed on another screen. Please try again.')||tbs_travel_state(uid)-'ok'; END IF;
  IF last.kind='return_office' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You are already back at the office.'); END IF;
  km:=round((payload->>'km')::numeric,2);
  IF operation='travel-arrive' THEN
   SELECT * INTO st FROM tbs_trip_stops WHERE id=NULLIF(payload->>'stopId','')::integer AND trip_id=t.id;
   IF st.id IS NULL OR EXISTS(SELECT 1 FROM tbs_trip_points WHERE stop_id=st.id) THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','You already checked in at this client.'); END IF;
   IF last.kind='start_home' THEN
    IF jsonb_typeof(payload->'officeKm') IS DISTINCT FROM 'number' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Distance from the office is missing.'); END IF;
    office_km:=round((payload->>'officeKm')::numeric,2);
    capped:=office_km<km;
   END IF;
   INSERT INTO tbs_trip_points(trip_id,kind,stop_id,lat,lng,accuracy_m) VALUES(t.id,'arrive',st.id,(payload->>'lat')::numeric,(payload->>'lng')::numeric,NULLIF(payload->>'accuracy','')::numeric) RETURNING id INTO p_id;
  ELSE
   dist:=tbs_geo_m((payload->>'lat')::numeric,(payload->>'lng')::numeric,s.office_lat,s.office_lng);
   IF dist>s.office_radius_m THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','You are not at the office yet.','distanceM',dist); END IF;
   IF last.kind<>'arrive' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Check in at a client first.'); END IF;
   INSERT INTO tbs_trip_points(trip_id,kind,lat,lng,accuracy_m) VALUES(t.id,'return_office',(payload->>'lat')::numeric,(payload->>'lng')::numeric,NULLIF(payload->>'accuracy','')::numeric) RETURNING id INTO p_id;
  END IF;
  INSERT INTO tbs_trip_legs(trip_id,from_point,to_point,route_km,km,amount,capped)
   VALUES(t.id,last.id,p_id,km,CASE WHEN capped THEN office_km ELSE km END,CASE WHEN t.mode='car' THEN round(CASE WHEN capped THEN office_km ELSE km END*t.rate,2) ELSE 0 END,capped);
  RETURN tbs_travel_state(uid);
 END IF;
 IF operation='travel-receipt-add' THEN
  IF COALESCE(payload->>'kind','') NOT IN ('toll','parking','grab','taxi','other') OR COALESCE(payload->>'mime','') NOT IN ('image/jpeg','image/png','application/pdf')
   OR COALESCE(payload->>'amount','')!~'^[0-9]{1,6}(\.[0-9]{1,2})?$' OR (payload->>'amount')::numeric<=0 OR length(COALESCE(payload->>'content',''))<10 THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Add a receipt photo and the amount.');
  END IF;
  IF (SELECT count(*) FROM tbs_trip_receipts WHERE trip_id=t.id)>=20 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','A trip can have up to 20 receipts.'); END IF;
  amt:=(payload->>'amount')::numeric;
  INSERT INTO tbs_trip_receipts(trip_id,kind,mime,content,read_amount,read_date,amount,edited,needs_original)
   VALUES(t.id,payload->>'kind',payload->>'mime',decode(payload->>'content','base64'),
    CASE WHEN COALESCE(payload->>'readAmount','')~'^[0-9]{1,6}(\.[0-9]{1,2})?$' THEN (payload->>'readAmount')::numeric END,
    CASE WHEN COALESCE(payload->>'readDate','')~'^\d{4}-\d{2}-\d{2}$' THEN (payload->>'readDate')::date END,
    amt,COALESCE(payload->>'readAmount','') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' OR (payload->>'readAmount')::numeric<>amt,
    payload->>'kind' IN ('toll','parking','other'));
  RETURN tbs_travel_state(uid);
 END IF;
 IF operation='travel-receipt-remove' THEN
  DELETE FROM tbs_trip_receipts WHERE trip_id=t.id AND id::text=payload->>'receiptId';
  RETURN tbs_travel_state(uid);
 END IF;
 IF operation='travel-submit' THEN
  t:=tbs_trip_finish(t.id,false);
  RETURN tbs_travel_state(uid)||jsonb_build_object('submitted',tbs_trip_json(t,false));
 END IF;
 IF operation='travel-cancel' THEN
  UPDATE tbs_trips SET status='cancelled' WHERE id=t.id;
  RETURN tbs_travel_state(uid);
 END IF;
 RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Unknown travel operation.');
END $$;

CREATE OR REPLACE FUNCTION tbs_travel_review(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE l tbs_trip_links%ROWTYPE; t tbs_trips%ROWTYPE; act text:=payload->>'action'; e tbs_employees%ROWTYPE; BEGIN
 IF COALESCE(payload->>'id','')!~'^[1-9][0-9]{0,8}$' OR COALESCE(payload->>'token','')!~'^[0-9a-fA-F-]{36}$' OR act NOT IN ('review','received','paid','receipt') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',404,'error','This link is not valid.');
 END IF;
 SELECT * INTO l FROM tbs_trip_links WHERE trip_id=(payload->>'id')::integer AND token_hash=tbs_token_hash(lower(payload->>'token'));
 IF l.trip_id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','This link is not valid.'); END IF;
 IF l.expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'statusCode',410,'error','This link has expired.'); END IF;
 SELECT * INTO t FROM tbs_trips WHERE id=l.trip_id FOR UPDATE;
 IF act='receipt' THEN
  RETURN COALESCE((SELECT jsonb_build_object('ok',true,'mime',mime,'content',encode(content,'base64')) FROM tbs_trip_receipts WHERE trip_id=t.id AND id::text=payload->>'receiptId'),
   jsonb_build_object('ok',false,'statusCode',404,'error','Receipt not found.'));
 END IF;
 IF act='received' THEN
  UPDATE tbs_trip_receipts SET original_received_at=now() WHERE trip_id=t.id AND needs_original AND original_received_at IS NULL
   AND (NULLIF(payload->>'receiptId','') IS NULL OR id::text=payload->>'receiptId');
 ELSIF act='paid' THEN
  IF t.status NOT IN ('submitted','approved') THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This trip is not ready to pay.'); END IF;
  UPDATE tbs_trips SET status='paid',paid_at=now() WHERE id=t.id RETURNING * INTO t;
 END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=t.user_id;
 RETURN jsonb_build_object('ok',true,'trip',tbs_trip_json(t,true)||jsonb_build_object('employee',concat_ws(' ',e.first_name,e.last_name)||CASE WHEN COALESCE(e.nickname,'')<>'' THEN ' ('||e.nickname||')' ELSE '' END,'department',e.department));
END $$;

CREATE OR REPLACE FUNCTION tbs_travel_daily(force boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE s tbs_travel_settings%ROWTYPE; today date:=(now() AT TIME ZONE 'Asia/Bangkok')::date; t record; n integer:=0; rows text:=''; total numeric:=0; e tbs_employees%ROWTYPE; j jsonb; BEGIN
 SELECT * INTO s FROM tbs_travel_settings WHERE singleton FOR UPDATE;
 IF NOT force AND (s.last_daily_date>=today OR (now() AT TIME ZONE 'Asia/Bangkok')::time<'07:00') THEN RETURN 0; END IF;
 UPDATE tbs_travel_settings SET last_daily_date=today WHERE singleton;
 FOR t IN SELECT id FROM tbs_trips WHERE status='open' AND trip_date<today LOOP PERFORM tbs_trip_finish(t.id,true); END LOOP;
 FOR t IN SELECT x.user_id,array_agg(r.id) ids FROM tbs_trip_receipts r JOIN tbs_trips x ON x.id=r.trip_id
  WHERE r.needs_original AND r.original_received_at IS NULL AND r.reminded_at IS NULL AND r.created_at<now()-interval '7 days' AND x.status NOT IN ('cancelled','rejected') AND x.user_id ~ '^U[0-9a-f]{32}$' GROUP BY x.user_id LOOP
  INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',t.user_id,jsonb_build_object('to',t.user_id,'messages',jsonb_build_array(jsonb_build_object('type','text',
   'text','Travel claim / เบิกค่าเดินทาง: ยังไม่ได้ส่งใบเสร็จตัวจริงให้บัญชี กรุณาส่งโดยเร็ว / Please hand your paper receipt to accounting.'))));
  UPDATE tbs_trip_receipts SET reminded_at=now() WHERE id=ANY(t.ids);
 END LOOP;
 IF s.accounting_email IS NULL THEN RETURN 0; END IF;
 FOR t IN SELECT x.* FROM tbs_trips x WHERE x.status IN ('submitted','approved') AND COALESCE(x.decided_at,x.submitted_at)>=((today-1)::timestamp AT TIME ZONE 'Asia/Bangkok') AND COALESCE(x.decided_at,x.submitted_at)<(today::timestamp AT TIME ZONE 'Asia/Bangkok') ORDER BY x.trip_date,x.id LOOP
  SELECT * INTO e FROM tbs_employees WHERE user_id=t.user_id;
  j:=tbs_trip_json((SELECT x FROM tbs_trips x WHERE x.id=t.id),false);
  total:=total+(j->>'total')::numeric; n:=n+1;
  rows:=rows||'<tr><td style="padding:10px 8px;border-bottom:1px solid #e2e8f0">'||tbs_html(COALESCE(NULLIF(e.nickname,''),e.first_name))||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0">'||tbs_html((SELECT string_agg(x,', ') FROM jsonb_array_elements_text(j->'clients') x))||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right">'||(j->>'km')||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right">'||(j->>'receiptAmount')||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold">'||(j->>'total')||'</td>'
   ||'<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0"><a href="'||tbs_html(tbs_trip_link(t.id))||'" style="color:#0e7490;font-weight:bold">เปิด / Open</a></td></tr>';
 END LOOP;
 IF n=0 THEN RETURN 0; END IF;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('email',(SELECT user_id FROM tbs_trips WHERE status IN ('submitted','approved') ORDER BY id DESC LIMIT 1),jsonb_build_object('to',s.accounting_email,
  'subject','สรุปค่าเดินทาง / Travel claims '||to_char(today-1,'DD Mon YYYY')||' · '||total||' THB',
  'html','<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:760px;margin:0 auto;padding:16px">'
   ||'<h2 style="margin:0 0 4px">สรุปค่าเดินทาง / Travel claims</h2><p style="margin:0 0 16px;color:#64748b">'||to_char(today-1,'DD Mon YYYY')||' · '||n||' trips · '||total||' THB</p>'
   ||'<table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:#f1f5f9;text-align:left"><th style="padding:8px">พนักงาน</th><th style="padding:8px">ลูกค้า</th><th style="padding:8px;text-align:right">กม.</th><th style="padding:8px;text-align:right">ใบเสร็จ</th><th style="padding:8px;text-align:right">รวม (บาท)</th><th></th></tr>'
   ||rows||'</table><p style="color:#64748b;font-size:12px;margin-top:16px">กด Open เพื่อดูเส้นทาง รูปใบเสร็จ และกดรับใบเสร็จตัวจริงหรือจ่ายแล้ว / Open a trip to see the route and receipts, and mark originals received or paid.</p></div>'));
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION tbs_line_job_wanted(payload jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT tbs_approval_request_id(payload) IS NOT NULL
  OR COALESCE(payload#>>'{messages,0,altText}',payload#>>'{messages,0,text}','') ~ '^(อนุมัติแล้ว / Approved|ไม่อนุมัติ / Leave rejected|Company SOP (added|updated) / ระเบียบบริษัท|Travel claim / เบิกค่าเดินทาง)';
$$;

DO $$ BEGIN
 IF to_regprocedure('tbs_cancellation_before_travel(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_cancellation(text,jsonb) RENAME TO tbs_cancellation_before_travel;
 END IF;
 IF to_regprocedure('tbs_dashboard_auth_before_travel(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_travel;
 END IF;
 IF to_regprocedure('tbs_claim_line_batch_before_travel(text)') IS NULL THEN
  ALTER FUNCTION tbs_claim_line_batch(text) RENAME TO tbs_claim_line_batch_before_travel;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF operation LIKE 'travel-%' AND operation<>'travel-review' THEN RETURN tbs_travel_employee(operation,payload); END IF;
 IF operation='travel-review' THEN RETURN tbs_travel_review(payload); END IF;
 RETURN tbs_cancellation_before_travel(operation,payload);
END $$;
CREATE OR REPLACE FUNCTION tbs_claim_line_batch(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
BEGIN
 IF channel IN ('line','email') AND pg_try_advisory_xact_lock(hashtext('tbs_travel_daily')) THEN
  BEGIN
   PERFORM tbs_travel_daily();
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Travel daily run skipped: %',SQLERRM;
  END;
 END IF;
 RETURN QUERY SELECT * FROM tbs_claim_line_batch_before_travel(channel);
END $$;

CREATE OR REPLACE FUNCTION tbs_travel_admin_people() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.user_id,'name',concat_ws(' ',e.first_name,e.last_name),'nickname',e.nickname,'department',e.department,
  'eligible',tbs_travel_eligible(e.user_id),'override',(SELECT allowed FROM tbs_travel_access a WHERE a.user_id=e.user_id)) ORDER BY e.department,e.first_name),'[]'::jsonb)
 FROM tbs_employees e WHERE COALESCE(e.status,'active')='active' AND e.employment_type='employee';
$$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; b jsonb:=COALESCE(payload->'body','{}'::jsonb); t tbs_trips%ROWTYPE; e tbs_employees%ROWTYPE; BEGIN
 IF op NOT IN ('travel-settings','travel-settings-save','travel-trips','travel-trip','travel-receipt','travel-decide','travel-access-save','travel-mark') THEN RETURN tbs_dashboard_auth_before_travel(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF op='travel-settings' THEN
  RETURN (SELECT jsonb_build_object('ok',true,'settings',jsonb_build_object('officeLat',office_lat,'officeLng',office_lng,'radius',office_radius_m,'rate',car_rate,
   'homeCutoff',to_char(home_cutoff,'HH24:MI'),'tripKmCap',trip_km_cap,'accountingEmail',accounting_email,'departments',to_jsonb(eligible_departments)),
   'people',tbs_travel_admin_people()) FROM tbs_travel_settings WHERE singleton);
 END IF;
 IF op='travel-settings-save' THEN
  IF actor.role NOT IN ('admin','ceo','hr') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Operation not permitted'); END IF;
  IF (b ? 'officeLat') AND NOT ((jsonb_typeof(b->'officeLat')='null' AND jsonb_typeof(b->'officeLng')='null') OR tbs_travel_coord(b,'officeLat','officeLng')) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the office location.'); END IF;
  IF COALESCE(b->>'homeCutoff','10:00')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the start-from-home time.'); END IF;
  BEGIN
   UPDATE tbs_travel_settings SET office_lat=CASE WHEN b ? 'officeLat' THEN NULLIF(b->>'officeLat','')::numeric ELSE office_lat END,
    office_lng=CASE WHEN b ? 'officeLng' THEN NULLIF(b->>'officeLng','')::numeric ELSE office_lng END,
    office_radius_m=COALESCE(NULLIF(b->>'radius','')::integer,office_radius_m),car_rate=COALESCE(NULLIF(b->>'rate','')::numeric,car_rate),
    home_cutoff=COALESCE(NULLIF(b->>'homeCutoff','')::time,home_cutoff),trip_km_cap=COALESCE(NULLIF(b->>'tripKmCap','')::numeric,trip_km_cap),
    accounting_email=CASE WHEN b ? 'accountingEmail' THEN NULLIF(lower(btrim(b->>'accountingEmail')),'') ELSE accounting_email END,
    eligible_departments=CASE WHEN jsonb_typeof(b->'departments')='array' THEN ARRAY(SELECT btrim(x) FROM jsonb_array_elements_text(b->'departments') x WHERE btrim(x)<>'') ELSE eligible_departments END,
    updated_at=now(),updated_by=actor.username WHERE singleton;
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the travel settings.');
  END;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'travel-settings-save',NULL);
  RETURN tbs_dashboard_auth(payload||jsonb_build_object('operation','travel-settings'));
 END IF;
 IF op='travel-access-save' THEN
  IF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=b->>'userId') THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Employee not found.'); END IF;
  IF jsonb_typeof(b->'allowed')='boolean' THEN
   INSERT INTO tbs_travel_access(user_id,allowed) VALUES(b->>'userId',(b->>'allowed')::boolean) ON CONFLICT(user_id) DO UPDATE SET allowed=EXCLUDED.allowed,updated_at=now();
  ELSE DELETE FROM tbs_travel_access WHERE user_id=b->>'userId'; END IF;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'travel-access-save',b->>'userId');
  RETURN jsonb_build_object('ok',true,'people',tbs_travel_admin_people());
 END IF;
 IF op='travel-trips' THEN
  RETURN jsonb_build_object('ok',true,'trips',(SELECT COALESCE(jsonb_agg(tbs_trip_json(x,false)||jsonb_build_object('employee',COALESCE(NULLIF(e2.nickname,''),e2.first_name),'department',e2.department) ORDER BY x.trip_date DESC,x.id DESC),'[]'::jsonb)
   FROM tbs_trips x JOIN tbs_employees e2 ON e2.user_id=x.user_id
   WHERE x.status<>'cancelled' AND x.trip_date>=COALESCE(NULLIF(b->>'from','')::date,(now() AT TIME ZONE 'Asia/Bangkok')::date-60)
    AND (NULLIF(b->>'status','') IS NULL OR x.status=b->>'status')));
 END IF;
 SELECT * INTO t FROM tbs_trips WHERE id=NULLIF(b->>'id','')::integer FOR UPDATE;
 IF t.id IS NULL AND op<>'travel-receipt' THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Trip not found.'); END IF;
 IF op='travel-receipt' THEN
  RETURN COALESCE((SELECT jsonb_build_object('ok',true,'mime',mime,'content',encode(content,'base64')) FROM tbs_trip_receipts WHERE id::text=b->>'receiptId'),jsonb_build_object('ok',false,'statusCode',404,'error','Receipt not found.'));
 END IF;
 IF op='travel-decide' THEN
  IF t.status<>'flagged' THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Only flagged trips need a decision.'); END IF;
  IF b->>'action' NOT IN ('approve','reject') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose approve or reject.'); END IF;
  UPDATE tbs_trips SET status=CASE WHEN b->>'action'='approve' THEN 'approved' ELSE 'rejected' END,decided_at=now(),decided_by=actor.username,decision_note=NULLIF(left(btrim(COALESCE(b->>'note','')),500),'') WHERE id=t.id RETURNING * INTO t;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'travel-'||(b->>'action'),t.id::text);
 ELSIF op='travel-mark' THEN
  IF b->>'action'='paid' THEN
   IF t.status NOT IN ('submitted','approved') THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This trip is not ready to pay.'); END IF;
   UPDATE tbs_trips SET status='paid',paid_at=now() WHERE id=t.id RETURNING * INTO t;
  ELSIF b->>'action'='received' THEN
   UPDATE tbs_trip_receipts SET original_received_at=now() WHERE trip_id=t.id AND needs_original AND original_received_at IS NULL;
  ELSE RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Unknown action.'); END IF;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'travel-mark-'||(b->>'action'),t.id::text);
 END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=t.user_id;
 RETURN jsonb_build_object('ok',true,'trip',tbs_trip_json(t,true)||jsonb_build_object('employee',concat_ws(' ',e.first_name,e.last_name)||CASE WHEN COALESCE(e.nickname,'')<>'' THEN ' ('||e.nickname||')' ELSE '' END,'department',e.department));
END $$;
COMMIT;
