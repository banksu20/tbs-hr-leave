BEGIN;
CREATE OR REPLACE FUNCTION tbs_trip_flag_text(f text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE f
  WHEN 'gps_weak' THEN 'GPS อ่อน / Weak GPS'
  WHEN 'too_fast' THEN 'เร็วผิดปกติ / Too fast'
  WHEN 'over_cap' THEN 'ระยะทางเกินกำหนด / Over the km limit'
  WHEN 'far_from_client' THEN 'เช็กอินไกลจากลูกค้า / Checked in far from the client'
  WHEN 'fare_high' THEN 'ค่าโดยสารสูง / Fare looks high'
  WHEN 'no_checkin' THEN 'ไม่ได้เช็กอินที่ลูกค้า / No check-in at the client'
  WHEN 'receipt_not_receipt' THEN 'รูปไม่ใช่ใบเสร็จ / Photo is not a receipt'
  WHEN 'receipt_date' THEN 'ใบเสร็จคนละวัน / Receipt from another day'
  WHEN 'receipt_time' THEN 'เวลาใบเสร็จไม่ตรงทริป / Receipt time outside the trip'
  WHEN 'receipt_duplicate' THEN 'ใบเสร็จเคยใช้แล้ว / Receipt used before'
  WHEN 'receipt_kind' THEN 'ใบเสร็จไม่ตรงการเดินทาง / Receipt does not match the trip'
  ELSE f END;
$$;

CREATE OR REPLACE FUNCTION tbs_trip_card_row(label text,value text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('type','box','layout','baseline','spacing','sm','contents',jsonb_build_array(
  jsonb_build_object('type','text','text',label,'size','xs','color','#64748B','flex',2),
  jsonb_build_object('type','text','text',COALESCE(NULLIF(btrim(value),''),'-'),'size','sm','color','#0F172A','flex',4,'wrap',true)));
$$;

CREATE OR REPLACE FUNCTION tbs_trip_accountant_card(t tbs_trips) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s tbs_travel_settings%ROWTYPE; e tbs_employees%ROWTYPE; j jsonb:=tbs_trip_json(t,false); who text; base text; receipts integer; extra jsonb:='[]'::jsonb; f text; BEGIN
 SELECT * INTO s FROM tbs_travel_settings WHERE singleton;
 IF s.payout_notify_user IS NULL OR s.payout_notify_user !~ '^U[0-9a-f]{32}$' THEN RETURN; END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=t.user_id;
 who:=COALESCE(NULLIF(e.nickname,'')||' · ','')||concat_ws(' ',e.first_name,e.last_name);
 SELECT app_url INTO base FROM tbs_email_fallback_settings WHERE singleton;
 SELECT count(*) INTO receipts FROM tbs_trip_receipts WHERE trip_id=t.id;
 FOREACH f IN ARRAY t.flags[1:4] LOOP
  extra:=extra||jsonb_build_array(jsonb_build_object('type','text','text','⚑ '||tbs_trip_flag_text(f),'size','xs','color','#B45309','wrap',true));
 END LOOP;
 IF (j->>'originalsWaiting')::int>0 THEN
  extra:=extra||jsonb_build_array(jsonb_build_object('type','text','text','รอใบเสร็จตัวจริง '||(j->>'originalsWaiting')||' ใบ / Paper receipts due','size','xs','color','#4338CA','wrap',true));
 END IF;
 IF t.auto_closed THEN
  extra:=extra||jsonb_build_array(jsonb_build_object('type','text','text','ปิดอัตโนมัติตอนเที่ยงคืน / Closed automatically at midnight','size','xs','color','#64748B','wrap',true));
 END IF;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',s.payout_notify_user,jsonb_build_object('to',s.payout_notify_user,'messages',jsonb_build_array(jsonb_build_object('type','flex',
  'altText',left('Travel claim / เบิกค่าเดินทาง: พบลูกค้า / Client meeting · '||who||' · '||(j->>'total')||' THB',300),
  'contents',jsonb_build_object('type','bubble',
   'header',jsonb_build_object('type','box','layout','vertical','backgroundColor','#0E7490','paddingAll','16px','contents',jsonb_build_array(
    jsonb_build_object('type','text','text','พบลูกค้า / Client meeting','size','xs','color','#CFFAFE','weight','bold'),
    jsonb_build_object('type','text','text',left(who,80),'size','lg','color','#FFFFFF','weight','bold','wrap',true),
    jsonb_build_object('type','text','text',concat_ws(' · ',NULLIF(e.department,''),to_char(t.trip_date,'DD/MM/YYYY')),'size','xs','color','#E0F2FE'))),
   'body',jsonb_build_object('type','box','layout','vertical','spacing','sm','contents',jsonb_build_array(
    tbs_trip_card_row('ลูกค้า / Client',left(COALESCE((SELECT string_agg(x,', ') FROM jsonb_array_elements_text(j->'clients') x),'-'),200)),
    tbs_trip_card_row('งาน / Purpose',CASE WHEN t.purpose='deal' THEN 'ปิดการขาย / Close a deal'||COALESCE(' · '||NULLIF(t.deal_ref,''),'') ELSE 'ดูแลลูกค้า / Customer care' END),
    tbs_trip_card_row('เดินทาง / Travel',CASE t.mode WHEN 'car' THEN 'รถส่วนตัว / Own car' WHEN 'grab' THEN 'Grab' ELSE 'แท็กซี่ / Taxi' END),
    tbs_trip_card_row('ระยะทาง / Distance',(j->>'km')||' km'||CASE WHEN t.mode='car' THEN ' · '||(j->>'kmAmount')||' บาท' ELSE '' END),
    tbs_trip_card_row('ใบเสร็จ / Receipts',receipts||' · '||(j->>'receiptAmount')||' บาท'),
    jsonb_build_object('type','separator','margin','md'),
    jsonb_build_object('type','box','layout','baseline','margin','md','contents',jsonb_build_array(
     jsonb_build_object('type','text','text','รวม / Total','size','sm','color','#64748B','flex',2),
     jsonb_build_object('type','text','text',(j->>'total')||' บาท','size','xl','weight','bold','color','#0F172A','align','end','flex',4))),
    jsonb_build_object('type','text','text',CASE WHEN t.status='flagged' THEN 'รอ HR ตรวจก่อนจ่าย / Waiting for HR check' ELSE 'พร้อมจ่าย / Ready for accounting' END,
     'size','sm','weight','bold','color',CASE WHEN t.status='flagged' THEN '#B45309' ELSE '#047857' END,'wrap',true))||extra),
   'footer',jsonb_build_object('type','box','layout','vertical','contents',jsonb_build_array(jsonb_build_object('type','button','style','primary','color','#0891B2','height','sm',
    'action',jsonb_build_object('type','uri','label','เปิดดู / Open','uri',COALESCE(base,'https://tbs-hr-leave.vercel.app')||'/ceo?view=travel&trip='||t.id)))))))));
END $$;

CREATE OR REPLACE FUNCTION tbs_trip_accountant_cards() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r tbs_trips%ROWTYPE; BEGIN
 FOR r IN SELECT x.* FROM finished_new n JOIN finished_old o ON o.id=n.id JOIN tbs_trips x ON x.id=n.id
  WHERE o.status='open' AND n.status IN ('submitted','flagged') ORDER BY n.id LOOP
  PERFORM tbs_trip_accountant_card(r);
 END LOOP;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS tbs_trip_accountant_cards ON tbs_trips;
CREATE TRIGGER tbs_trip_accountant_cards AFTER UPDATE ON tbs_trips REFERENCING OLD TABLE AS finished_old NEW TABLE AS finished_new
 FOR EACH STATEMENT EXECUTE FUNCTION tbs_trip_accountant_cards();
COMMIT;
