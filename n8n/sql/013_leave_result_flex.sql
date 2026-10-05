-- Apply through an n8n PostgreSQL node after 009. Changes future notifications only.
-- Existing queued/sent messages are intentionally untouched; no messages are sent by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION tbs_card_dates(dates date[]) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE((SELECT string_agg(to_char(d,'DD Mon YYYY'),', ' ORDER BY d) FROM (SELECT d FROM unnest(dates)d ORDER BY d LIMIT 8) shown),'—')
 ||CASE WHEN cardinality(dates)>8 THEN format(' … (+%s more dates / วันที่เพิ่มเติม; view full request in app)',cardinality(dates)-8) ELSE '' END;
$$;
CREATE OR REPLACE FUNCTION tbs_leave_result_flex(r jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 approved boolean := r->>'status'='Approved';
 accent text; background text; title text; employee text; dates text; kind text; blocks jsonb;
BEGIN
 accent:=CASE WHEN approved THEN '#16A34A' ELSE '#DC2626' END;
 background:=CASE WHEN approved THEN '#F0FDF4' ELSE '#FEF2F2' END;
 title:=CASE WHEN approved THEN 'อนุมัติแล้ว / Approved' WHEN r->>'decision_kind'='cancel' THEN 'ยกเลิกวันลาแล้ว / Leave cancelled' ELSE 'ไม่อนุมัติ / Leave rejected' END;
 SELECT COALESCE(NULLIF(btrim(concat_ws(' ',first_name,last_name)),''),NULLIF(nickname,''))
 INTO employee FROM tbs_employees WHERE user_id=r->>'user_id';
 employee:=COALESCE(NULLIF(r->>'user_name',''),employee,'Employee');
 dates:=tbs_card_dates(tbs_request_dates(r->>'selected_dates',(r->>'start_date')::date,(r->>'end_date')::date));
 kind:=CASE lower(r->>'leave_type') WHEN 'annual' THEN 'Annual / ลาพักร้อน'
 WHEN 'sick' THEN 'Sick / ลาป่วย' WHEN 'personal' THEN 'Personal / ลากิจ' ELSE r->>'leave_type' END;
 blocks:=jsonb_build_array(
   jsonb_build_object('type','text','text',title,'weight','bold','size','xl','color',accent,'wrap',true),
   jsonb_build_object('type','text','text',left(employee,200),'weight','bold','size','md','wrap',true),
   jsonb_build_object('type','text','text','Leave result / ผลการลา · #'||(r->>'id'),'size','xs','color','#64748B','wrap',true),
   jsonb_build_object('type','separator'),
   jsonb_build_object('type','box','layout','vertical','spacing','sm','paddingAll','lg','backgroundColor',background,'cornerRadius','md','contents',jsonb_build_array(
     jsonb_build_object('type','text','text','วันที่ / Dates','size','sm','color','#64748B'),
     jsonb_build_object('type','text','text',left(COALESCE(dates,'—'),2000),'weight','bold','color',accent,'wrap',true),
     jsonb_build_object('type','text','text',COALESCE(NULLIF(kind,''),'Leave'),'weight','bold','wrap',true),
     jsonb_build_object('type','text','text',COALESCE(r->>'leave_days','0')||' day(s) / วัน'||
       CASE r->>'half_day_period' WHEN 'morning' THEN ' · Morning / ช่วงเช้า' WHEN 'afternoon' THEN ' · Afternoon / ช่วงบ่าย' ELSE '' END,'size','sm','wrap',true)
   ))
 );
 IF NULLIF(btrim(r->>'rejection_reason'),'') IS NOT NULL THEN
   blocks:=blocks||jsonb_build_array(jsonb_build_object('type','text','text','เหตุผล / Reason: '||left(r->>'rejection_reason',1800),'size','sm','wrap',true,'color','#475569'));
 END IF;
 RETURN jsonb_build_object('type','flex','altText',left(title||' · '||employee||' · #'||(r->>'id'),400),
   'contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','spacing','md','contents',blocks)));
END;
$$;
CREATE OR REPLACE FUNCTION tbs_queue_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; years integer[]; y integer; r jsonb;
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'updated_at')=(to_jsonb(NEW)-'updated_at') THEN RETURN NEW; END IF;
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='leave_requests' THEN
   IF TG_OP<>'INSERT' THEN
     FOR d IN SELECT unnest(tbs_request_dates(OLD.selected_dates,OLD.start_date::date,OLD.end_date::date)) LOOP
       years:=array_append(years,extract(year FROM d)::int);
     END LOOP;
   END IF;
   IF TG_OP<>'DELETE' THEN
     FOR d IN SELECT unnest(tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date)) LOOP
       years:=array_append(years,extract(year FROM d)::int);
     END LOOP;
   END IF;
   IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Approved','Rejected') THEN
     INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',NEW.user_id,
       jsonb_build_object('to',COALESCE((SELECT account_user_id FROM tbs_request_accounts WHERE request_id=NEW.id),NEW.user_id),
       'messages',jsonb_build_array(tbs_leave_result_flex(to_jsonb(NEW)||jsonb_build_object('decision_kind',current_setting('app.tbs_action',true))))));
   END IF;
 ELSIF TG_TABLE_NAME='leave_quotas' THEN years:=ARRAY[(r->>'year')::int];
 ELSE SELECT array_agg(DISTINCT year) INTO years FROM leave_quotas WHERE user_id=r->>'user_id';
 END IF;
 FOR y IN SELECT DISTINCT unnest(years) LOOP PERFORM tbs_queue_sheet(r->>'user_id',y); END LOOP;
 RETURN COALESCE(NEW,OLD);
END;
$$;

COMMIT;
