BEGIN;
CREATE OR REPLACE FUNCTION tbs_trip_line_text(uid text,body text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF uid IS NULL OR uid !~ '^U[0-9a-f]{32}$' THEN RETURN; END IF;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',uid,jsonb_build_object('to',uid,'messages',jsonb_build_array(jsonb_build_object('type','text',
  'text',left('Travel claim / เบิกค่าเดินทาง: '||body,4900)))));
END $$;

CREATE OR REPLACE FUNCTION tbs_trip_place(tid integer) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE(left((SELECT string_agg(client_name,', ' ORDER BY seq) FROM tbs_trip_stops WHERE trip_id=tid),120),'-')
  ||' · '||to_char((SELECT trip_date FROM tbs_trips WHERE id=tid),'DD/MM/YYYY');
$$;

CREATE OR REPLACE FUNCTION tbs_trip_status_notices() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
 FOR r IN SELECT n.* FROM changed_new n JOIN changed_old o ON o.id=n.id WHERE n.status IN ('approved','rejected') AND o.status='flagged' ORDER BY n.id LOOP
  IF r.status='approved' THEN
   PERFORM tbs_trip_line_text(r.user_id,'อนุมัติแล้ว / Approved'||E'\n'||tbs_trip_place(r.id)||E'\n'
    ||(tbs_trip_json((SELECT x FROM tbs_trips x WHERE x.id=r.id),false)->>'total')||' บาท / THB · ส่งบัญชีแล้ว / Sent to accounting');
  ELSE
   PERFORM tbs_trip_line_text(r.user_id,'ไม่อนุมัติ / Not approved'||E'\n'||tbs_trip_place(r.id)
    ||CASE WHEN COALESCE(r.decision_note,'')<>'' THEN E'\n'||'เหตุผล / Reason: '||r.decision_note ELSE '' END
    ||E'\n'||'สอบถาม HR ได้ / Ask HR if you have questions.');
  END IF;
 END LOOP;
 FOR r IN SELECT n.user_id,count(*) trips,sum((tbs_trip_json(x,false)->>'total')::numeric) total,
   string_agg(tbs_trip_place(n.id)||' · '||(tbs_trip_json(x,false)->>'total')||' บาท',E'\n' ORDER BY n.trip_date,n.id) lines
  FROM changed_new n JOIN changed_old o ON o.id=n.id JOIN tbs_trips x ON x.id=n.id
  WHERE n.status='paid' AND o.status<>'paid' GROUP BY n.user_id LOOP
  PERFORM tbs_trip_line_text(r.user_id,'จ่ายแล้ว / Paid '||r.total||' บาท / THB'
   ||CASE WHEN r.trips>1 THEN ' ('||r.trips||' ทริป / trips)' ELSE '' END||E'\n'||r.lines);
 END LOOP;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS tbs_trip_status_notices ON tbs_trips;
CREATE TRIGGER tbs_trip_status_notices AFTER UPDATE ON tbs_trips REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new
 FOR EACH STATEMENT EXECUTE FUNCTION tbs_trip_status_notices();

CREATE OR REPLACE FUNCTION tbs_trip_receipt_notices() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
 FOR r IN SELECT t.id,t.user_id,count(*) n,
   (SELECT count(*) FROM tbs_trip_receipts w WHERE w.trip_id=t.id AND w.needs_original AND w.original_received_at IS NULL) left_over
  FROM received_new n JOIN received_old o ON o.id=n.id JOIN tbs_trips t ON t.id=n.trip_id
  WHERE n.original_received_at IS NOT NULL AND o.original_received_at IS NULL AND t.status NOT IN ('cancelled','rejected')
  GROUP BY t.id,t.user_id ORDER BY t.id LOOP
  PERFORM tbs_trip_line_text(r.user_id,'ได้รับใบเสร็จตัวจริงแล้ว / Paper receipts received ('||r.n||')'||E'\n'||tbs_trip_place(r.id)
   ||CASE WHEN r.left_over>0 THEN E'\n'||'ยังขาดอีก '||r.left_over||' ใบ / '||r.left_over||' still missing' ELSE '' END);
 END LOOP;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS tbs_trip_receipt_notices ON tbs_trip_receipts;
CREATE TRIGGER tbs_trip_receipt_notices AFTER UPDATE ON tbs_trip_receipts REFERENCING OLD TABLE AS received_old NEW TABLE AS received_new
 FOR EACH STATEMENT EXECUTE FUNCTION tbs_trip_receipt_notices();
COMMIT;
