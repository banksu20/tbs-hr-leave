BEGIN;
DROP FUNCTION IF EXISTS tbs_mail_doc(text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS tbs_mail_section(text,integer);
DROP FUNCTION IF EXISTS tbs_mail_rows(text[]);
DROP FUNCTION IF EXISTS tbs_mail_button(text,text,text,text,text);
DROP FUNCTION IF EXISTS tbs_mail_dates(date[]);
DROP FUNCTION IF EXISTS tbs_mail_leave_type(text);
DROP FUNCTION IF EXISTS tbs_mail_days(leave_requests);
DROP FUNCTION IF EXISTS tbs_mail_person(jsonb,leave_requests);
DROP FUNCTION IF EXISTS tbs_mail_balance_rows(leave_requests);

CREATE OR REPLACE FUNCTION tbs_mail_font() RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT '-apple-system,BlinkMacSystemFont,''Helvetica Neue'',''Segoe UI'',Roboto,Arial,''Noto Sans Thai'',''Sukhumvit Set'',Tahoma,sans-serif';
$$;

CREATE OR REPLACE FUNCTION tbs_mail_text(t text,size integer DEFAULT 16,color text DEFAULT '#111111',bold boolean DEFAULT false,top integer DEFAULT 0) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT '<div style="margin-top:'||top||'px;font-size:'||size||'px;line-height:1.45;color:'||color||';'||CASE WHEN bold THEN 'font-weight:700;' ELSE '' END||'word-wrap:break-word">'||t||'</div>';
$$;

CREATE OR REPLACE FUNCTION tbs_mail_separator(top integer DEFAULT 12) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT '<div style="margin-top:'||top||'px;height:1px;line-height:1px;font-size:0;background:#e5e7eb">&nbsp;</div>';
$$;

CREATE OR REPLACE FUNCTION tbs_mail_box(inner_html text,bg text,top integer DEFAULT 12) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:'||top||'px;border-collapse:separate"><tr><td bgcolor="'||bg||'" style="padding:16px;background:'||bg||';border-radius:8px">'||inner_html||'</td></tr></table>';
$$;

CREATE OR REPLACE FUNCTION tbs_mail_button(href text,label text,primary_style boolean DEFAULT true,top integer DEFAULT 8) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:'||top||'px;border-collapse:separate"><tr><td align="center" bgcolor="'||CASE WHEN primary_style THEN '#06c755' ELSE '#dcdfe5' END||'" style="border-radius:8px;background:'||CASE WHEN primary_style THEN '#06c755' ELSE '#dcdfe5' END||'">'
  ||'<a href="'||tbs_html(href)||'" target="_blank" style="display:block;padding:15px 12px;font-size:16px;font-weight:700;line-height:1.3;color:'||CASE WHEN primary_style THEN '#ffffff' ELSE '#111111' END||';text-decoration:none;border-radius:8px">'||label||'</a></td></tr></table>';
$$;

CREATE OR REPLACE FUNCTION tbs_mail_bar(pct integer,color text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:10px;border-collapse:separate"><tr>'
  ||CASE WHEN pct>0 THEN '<td width="'||pct||'%" bgcolor="'||color||'" style="height:8px;background:'||color||';border-radius:4px;font-size:0;line-height:0">&nbsp;</td>' ELSE '' END
  ||CASE WHEN pct<100 THEN '<td bgcolor="#e5e7eb" style="height:8px;background:#e5e7eb;border-radius:4px;font-size:0;line-height:0">&nbsp;</td>' ELSE '' END
  ||'</tr></table>';
$$;

CREATE OR REPLACE FUNCTION tbs_mail_bubble(body text,footer text,note text,preheader text DEFAULT '') RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  ||'<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">'
  ||'<style>@media (max-width:600px){.tbs-outer{padding:16px 10px!important}}</style></head>'
  ||'<body style="margin:0;padding:0;background:#eef1f5;-webkit-text-size-adjust:100%">'
  ||'<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef1f5">'||tbs_html(preheader)||'</div>'
  ||'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f5" style="width:100%;background:#eef1f5"><tr><td class="tbs-outer" align="center" style="padding:32px 12px">'
  ||'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:440px;font-family:'||tbs_mail_font()||'">'
  ||'<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:18px;box-shadow:0 1px 3px rgba(0,0,0,.08)">'
  ||'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%"><tr><td style="padding:20px 20px '||CASE WHEN footer<>'' THEN '12px' ELSE '20px' END||'">'||body||'</td></tr>'
  ||CASE WHEN footer<>'' THEN '<tr><td style="padding:4px 20px 20px">'||footer||'</td></tr>' ELSE '' END
  ||'</table></td></tr>'
  ||'<tr><td style="padding:14px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:#8a94a6">'||note||'</td></tr>'
  ||'</table></td></tr></table></body></html>';
$$;

CREATE OR REPLACE FUNCTION tbs_mail_name(r leave_requests) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(btrim(concat_ws(' ',e.first_name,e.last_name)),''),NULLIF(e.nickname,''),NULLIF(r.user_name,''),'Employee')
  ||CASE WHEN COALESCE(e.nickname,'')<>'' AND btrim(concat_ws(' ',e.first_name,e.last_name))<>'' THEN ' ('||e.nickname||')' ELSE '' END
 FROM (SELECT 1) one LEFT JOIN tbs_employees e ON e.user_id=r.user_id;
$$;

CREATE OR REPLACE FUNCTION tbs_mail_period(r leave_requests) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE r.half_day_period WHEN 'morning' THEN ' · ช่วงเช้า / Morning' WHEN 'afternoon' THEN ' · ช่วงบ่าย / Afternoon' ELSE '' END;
$$;

CREATE OR REPLACE FUNCTION tbs_mail_card_dates(r leave_requests) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT tbs_card_dates(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date));
$$;

DROP FUNCTION IF EXISTS tbs_mail_approved_html(leave_requests);
CREATE FUNCTION tbs_mail_approved_html(r leave_requests) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT tbs_mail_bubble(
  tbs_mail_text('อนุมัติแล้ว / Approved',22,'#16a34a',true)
  ||tbs_mail_text(tbs_html(tbs_mail_name(r)),16,'#111111',true,12)
  ||tbs_mail_text(tbs_html(COALESCE(NULLIF(r.department,'')||' · ','')||'Leave result / ผลการลา · #'||r.id),13,'#64748b',false,12)
  ||tbs_mail_separator(12)
  ||tbs_mail_box(
    tbs_mail_text('วันที่ / Dates',14,'#64748b')
    ||tbs_mail_text(tbs_html(tbs_mail_card_dates(r)),16,'#16a34a',true,8)
    ||tbs_mail_text(CASE lower(COALESCE(r.leave_type,'')) WHEN 'annual' THEN 'Annual / ลาพักร้อน' WHEN 'university' THEN 'University activities / กิจกรรมมหาวิทยาลัย' WHEN 'sick' THEN 'Sick / ลาป่วย' WHEN 'personal' THEN 'Personal / ลากิจ' ELSE tbs_html(r.leave_type) END,16,'#111111',true,8)
    ||tbs_mail_text(trim_scale(COALESCE(r.leave_days,0))||' day(s) / วัน'||tbs_mail_period(r),14,'#111111',false,8),'#f0fdf4',12)
  ||tbs_mail_text('โปรดวางแผนดูแลงานแทนในช่วงที่ลา<br>Please plan cover for their work while they are away.',14,'#475569',false,14),
  '',
  'TBS HR · ส่งอัตโนมัติเมื่ออนุมัติการลา ไม่ต้องตอบกลับ<br>Sent automatically when leave is approved. No reply needed.',
  tbs_mail_name(r)||' · '||tbs_mail_card_dates(r));
$$;

DROP FUNCTION IF EXISTS tbs_mail_approval_html(leave_requests,text,timestamptz);
CREATE FUNCTION tbs_mail_approval_html(r leave_requests,link text,expires timestamptz) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT tbs_mail_bubble(
  tbs_mail_text('คำขอลาใหม่ / New leave request',16,'#009944',true)
  ||tbs_mail_text(tbs_html(tbs_mail_name(r)),16,'#111111',true,6)
  ||CASE WHEN COALESCE(r.department,'')<>'' THEN tbs_mail_text(tbs_html(r.department),13,'#64748b',false,2) ELSE '' END
  ||tbs_mail_text(tbs_html(tbs_mail_card_dates(r)),16,'#111111',false,6)
  ||tbs_mail_text(CASE lower(COALESCE(r.leave_type,'')) WHEN 'annual' THEN 'ลาพักร้อน / Annual' WHEN 'university' THEN 'กิจกรรมมหาวิทยาลัย / University activities' WHEN 'sick' THEN 'ลาป่วย / Sick' WHEN 'personal' THEN 'ลากิจ / Personal' ELSE tbs_html(r.leave_type) END
   ||' · '||trim_scale(COALESCE(r.leave_days,0))||' วัน / days'||tbs_mail_period(r),16,'#111111',false,6)
  ||tbs_mail_text(tbs_html(COALESCE(NULLIF(r.reason,''),'No reason supplied')),16,'#111111',false,6)
  ||COALESCE(tbs_mail_text(tbs_html(tbs_request_balance_line(r)),14,'#475569',false,6),''),
  tbs_mail_button(link||'&action=approve','อนุมัติ / Approve',true,0)
  ||tbs_mail_button(link||'&action=reject','ปฏิเสธ / Reject',false,8)
  ||tbs_mail_text('กดยืนยันในหน้าถัดไป ลิงก์นี้ใช้ได้ครั้งเดียว หมดอายุ '||to_char(expires AT TIME ZONE 'Asia/Bangkok','FMDD Mon YYYY')||'<br>You confirm on the next page. This link works once and expires on '||to_char(expires AT TIME ZONE 'Asia/Bangkok','FMDD Mon YYYY')||'.',12,'#8a94a6',false,12),
  'TBS HR · ส่งทางอีเมลเพราะข้อความ LINE เดือนนี้เต็มแล้ว<br>Sent by email because LINE''s monthly message limit has been reached.',
  tbs_mail_name(r)||' · '||tbs_mail_card_dates(r));
$$;

CREATE OR REPLACE FUNCTION tbs_mail_quota_html(st jsonb) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE lvl integer:=(st->>'level')::integer; used integer:=(st->>'used')::integer; lim integer:=(st->>'limit')::integer; pct integer; accent text; tint text; title text; what text; base text; BEGIN
 SELECT app_url INTO base FROM tbs_email_fallback_settings WHERE singleton;
 pct:=CASE WHEN lim>0 THEN least(100,round(used*100.0/lim)) ELSE 0 END;
 accent:=CASE lvl WHEN 3 THEN '#dc2626' WHEN 2 THEN '#ea580c' ELSE '#d97706' END;
 tint:=CASE lvl WHEN 3 THEN '#fef2f2' WHEN 2 THEN '#fff7ed' ELSE '#fffbeb' END;
 title:=CASE lvl WHEN 3 THEN 'LINE เต็มแล้ว / LINE messages are used up' WHEN 2 THEN 'LINE ใกล้เต็ม / LINE messages almost used up' ELSE 'LINE ใช้ไป '||pct||'% / LINE messages '||pct||'% used' END;
 what:=CASE lvl WHEN 3 THEN 'คำขอลาจะส่งทางอีเมลแทน ข้อความอื่นจะรอส่งหลังรีเซ็ต<br>Leave requests now go to approvers by email. Other LINE messages wait and go out after the reset.'
  WHEN 2 THEN 'ข้อความ SOP และค่าเดินทางจะรอส่งหลังรีเซ็ต เพื่อเก็บโควตาไว้ให้เรื่องการลา<br>SOP and travel claim messages now wait until the reset, so leave requests and decisions can still go out.'
  ELSE 'ยังไม่มีข้อความถูกพักไว้ ลองพิจารณาเพิ่มแพ็กเกจ LINE<br>Nothing is held yet. Consider a bigger LINE plan before the limit is reached.' END;
 RETURN tbs_mail_bubble(
  tbs_mail_text(title,22,accent,true)
  ||tbs_mail_text('ข้อความ LINE รายเดือน / LINE monthly messages',13,'#64748b',false,12)
  ||tbs_mail_separator(12)
  ||tbs_mail_box(
    tbs_mail_text('ใช้ไปแล้ว / Used',14,'#64748b')
    ||tbs_mail_text(used||' <span style="font-size:16px;font-weight:400;color:#64748b">/ '||lim||'</span>',28,accent,true,6)
    ||tbs_mail_bar(pct,accent)
    ||tbs_mail_text('รีเซ็ต / Resets: <b>'||to_char((st->>'resetsAt')::timestamptz AT TIME ZONE 'Asia/Bangkok','Dy FMDD Mon, HH24:MI')||'</b> (Bangkok)',14,'#111111',false,12)
    ||tbs_mail_text('รอส่ง / Waiting: <b>'||COALESCE(st->>'heldMessages','0')||'</b> ข้อความ / messages',14,'#111111',false,6),tint,12)
  ||tbs_mail_text(what,14,'#475569',false,14),
  tbs_mail_button(COALESCE(base,'https://tbs-hr-leave.vercel.app')||'/ceo','เปิดแดชบอร์ด / Open dashboard',true,0),
  'TBS HR · ตั้งค่าได้ที่ การแจ้งเตือนการส่งข้อมูล → Warning settings<br>One email per level each month.',
  used||' / '||lim||' LINE messages used this month');
END $$;
COMMIT;
