BEGIN;
CREATE TABLE IF NOT EXISTS tbs_approved_leave_email_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 recipients jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(recipients)='array'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tbs_approved_leave_email_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_approved_leave_emails(
 request_id integer PRIMARY KEY,
 recipients integer NOT NULL,
 queued_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION tbs_approved_leave_payload(r leave_requests,recipient text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE d jsonb:=tbs_email_request_details(r); kind text:=CASE WHEN r.leave_type='vacation' THEN 'annual' ELSE lower(COALESCE(r.leave_type,'')) END;
 color text:=tbs_email_leave_color(kind); tint text:=tbs_email_leave_tint(kind); type_label text; tiles text; days text; period text; BEGIN
 type_label:=CASE kind WHEN 'annual' THEN 'Annual leave · ลาพักร้อน' WHEN 'sick' THEN 'Sick leave · ลาป่วย' WHEN 'personal' THEN 'Personal leave · ลากิจ'
  WHEN 'university' THEN 'University activity · กิจกรรมมหาวิทยาลัย' ELSE initcap(kind) END;
 SELECT string_agg('<div style="display:inline-block;width:76px;margin:0 8px 8px 0;vertical-align:top;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;text-align:center;overflow:hidden">'
   ||'<div style="padding:5px 0;background:'||color||';color:#ffffff;font-size:10px;font-weight:bold;letter-spacing:1px">'||upper(to_char(x::date,'Mon YYYY'))||'</div>'
   ||'<div style="padding:8px 0 0;font-size:26px;line-height:1;font-weight:bold;color:#0f172a">'||to_char(x::date,'FMDD')||'</div>'
   ||'<div style="padding:4px 0 9px;font-size:12px;color:#64748b">'||to_char(x::date,'Dy')||'</div></div>','' ORDER BY x::date) INTO tiles
  FROM jsonb_array_elements_text(d->'dates') x;
 days:=trim_scale(COALESCE(r.leave_days,0))::text;
 days:=days||CASE WHEN days='1' THEN ' day · วัน' ELSE ' days · วัน' END;
 period:=CASE WHEN r.half_day_period='morning' THEN ' · Morning ช่วงเช้า' WHEN r.half_day_period='afternoon' THEN ' · Afternoon ช่วงบ่าย' ELSE '' END;
 RETURN jsonb_build_object('to',recipient,'requestId',r.id,
  'subject','Leave approved / อนุมัติการลา: '||(d->>'name')||' · '||tbs_leave_date_text(r),
  'html','<div style="margin:0;padding:28px 12px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif">'
   ||'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;border-collapse:separate;color:#0f172a">'
   ||'<tr><td bgcolor="#047857" style="padding:22px 24px;background:#047857;border-radius:19px 19px 0 0">'
   ||'<div style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#d1fae5">TBS HR · LEAVE APPROVED</div>'
   ||'<div style="margin-top:8px;font-size:21px;line-height:1.3;font-weight:bold;color:#ffffff">'||tbs_html(d->>'name')||' will be on leave</div>'
   ||'<div style="margin-top:2px;font-size:14px;color:#d1fae5">อนุมัติการลาแล้ว</div></td></tr>'
   ||'<tr><td style="padding:20px 24px 4px"><div style="font-size:13px;color:#64748b">'||tbs_html(COALESCE(r.department,''))||'</div>'
   ||'<div style="margin-top:12px"><span style="display:inline-block;margin:0 6px 6px 0;padding:7px 14px;border-radius:999px;background:'||tint||';color:'||color||';font-size:13px;font-weight:bold">'||tbs_html(type_label)||'</span>'
   ||'<span style="display:inline-block;margin:0 6px 6px 0;padding:7px 14px;border-radius:999px;background:#f1f5f9;color:#334155;font-size:13px;font-weight:bold">'||tbs_html(days||period)||'</span></div></td></tr>'
   ||'<tr><td style="padding:10px 24px 0">'||tbs_email_label('Dates · วันที่')||'<div style="margin-top:10px">'||COALESCE(tiles,'')||'</div></td></tr>'
   ||'<tr><td style="padding:14px 24px 24px"><div style="padding:12px 14px;border-radius:12px;background:#f8fafc;font-size:12px;line-height:1.6;color:#64748b">Please plan cover for their work and clients. No reply is needed.<br>โปรดวางแผนดูแลงานและลูกค้าแทนในช่วงนี้ ไม่ต้องตอบกลับอีเมลนี้</div></td></tr>'
   ||'</table></div>');
END $$;

CREATE OR REPLACE FUNCTION tbs_approved_leave_email() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE people jsonb; mail text; n integer:=0; BEGIN
 IF lower(COALESCE(NEW.status,''))<>'approved' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND lower(COALESCE(OLD.status,''))='approved' THEN RETURN NEW; END IF;
 SELECT recipients INTO people FROM tbs_approved_leave_email_settings WHERE singleton;
 IF people IS NULL OR jsonb_array_length(people)=0 THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM tbs_approved_leave_emails WHERE request_id=NEW.id) THEN RETURN NEW; END IF;
 FOR mail IN SELECT DISTINCT lower(btrim(x)) FROM jsonb_array_elements_text(people) x WHERE btrim(x) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' LOOP
  INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('email',NEW.user_id,tbs_approved_leave_payload(NEW,mail));
  n:=n+1;
 END LOOP;
 IF n>0 THEN INSERT INTO tbs_approved_leave_emails(request_id,recipients) VALUES(NEW.id,n); END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'Approved leave email skipped for %: %',NEW.id,SQLERRM;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_tbs_approved_leave_email ON leave_requests;
CREATE TRIGGER zz_tbs_approved_leave_email AFTER INSERT OR UPDATE OF status ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_approved_leave_email();
COMMIT;
