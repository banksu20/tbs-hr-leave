BEGIN;
CREATE OR REPLACE FUNCTION tbs_approved_leave_payload(r leave_requests,recipient text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('to',recipient,'requestId',r.id,
  'subject','Leave approved / อนุมัติการลา: '||tbs_mail_name(r)||' · '||tbs_leave_date_text(r),
  'html',tbs_mail_approved_html(r));
$$;

CREATE OR REPLACE FUNCTION tbs_email_approval_payload(r leave_requests,recipient jsonb,token text,expires timestamptz) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('to',recipient->>'email','requestId',r.id,
  'subject','Leave approval needed / คำขอลารออนุมัติ: '||tbs_mail_name(r),
  'html',tbs_mail_approval_html(r,(SELECT app_url FROM tbs_email_fallback_settings WHERE singleton)||'/email-decision?id='||r.id||'&t='||token,expires));
$$;

CREATE OR REPLACE FUNCTION tbs_line_quota_warn(st jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE q tbs_line_quota%ROWTYPE; m date:=tbs_line_month(now()); lvl integer:=(st->>'level')::integer; head text; BEGIN
 SELECT * INTO q FROM tbs_line_quota WHERE singleton FOR UPDATE;
 IF lvl=0 OR q.alert_email IS NULL OR (q.warned_month=m AND q.warned_level>=lvl) THEN RETURN; END IF;
 UPDATE tbs_line_quota SET warned_month=m,warned_level=lvl WHERE singleton;
 head:=CASE lvl WHEN 3 THEN 'LINE เต็มแล้ว / LINE messages are used up'
  WHEN 2 THEN 'LINE ใกล้เต็ม / LINE messages almost used up' ELSE 'LINE ใช้ไป '||(st->>'percent')||'% / LINE messages '||(st->>'percent')||'% used' END;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('email','line-quota',jsonb_build_object('to',q.alert_email,
  'subject',head||' ('||(st->>'used')||' / '||(st->>'limit')||')',
  'html',tbs_mail_quota_html(st)));
END $$;
COMMIT;
