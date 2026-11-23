BEGIN;
DO $$ DECLARE c text; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='tbs_sync_jobs'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
  EXECUTE format('ALTER TABLE tbs_sync_jobs DROP CONSTRAINT %I',c);
 END LOOP;
END $$;
ALTER TABLE tbs_sync_jobs ADD CONSTRAINT tbs_sync_jobs_kind_check CHECK(kind IN ('sheet','line','email'));
CREATE TABLE IF NOT EXISTS tbs_email_fallback_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 recipients jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(recipients)='array'),
 app_url text NOT NULL DEFAULT 'https://tbs-hr-leave.vercel.app',
 line_full_until timestamptz
);
INSERT INTO tbs_email_fallback_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_email_decision_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id integer NOT NULL REFERENCES leave_requests(id),
 recipient text NOT NULL,
 recipient_name text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 used_action text
);
CREATE INDEX IF NOT EXISTS tbs_email_decision_links_request ON tbs_email_decision_links(request_id);
CREATE OR REPLACE FUNCTION tbs_html(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT replace(replace(replace(replace(replace(COALESCE(t,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),chr(10),'<br>');
$$;
CREATE OR REPLACE FUNCTION tbs_token_hash(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(t,'UTF8')),'hex');
$$;
CREATE OR REPLACE FUNCTION tbs_approval_request_id(payload jsonb) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(substring(payload::text from 'action=approve&db_id=([0-9]+)'),substring(payload::text from '/leave-decision\?id=([0-9]+)'))::integer;
$$;
CREATE OR REPLACE FUNCTION tbs_email_request_details(r leave_requests) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',r.id,
  'name',COALESCE(NULLIF(concat_ws(' ',NULLIF(e.first_name,''),NULLIF(e.last_name,'')),''),r.user_name)||CASE WHEN COALESCE(e.nickname,'')<>'' THEN ' ('||e.nickname||')' ELSE '' END,
  'department',r.department,'type',r.leave_type,
  'dates',to_jsonb(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date)),
  'days',r.leave_days,'period',r.half_day_period,'reason',COALESCE(r.reason,''),'status',r.status,
  'balance',tbs_request_balance_line(r))
 FROM (SELECT 1) one LEFT JOIN tbs_employees e ON e.user_id=r.user_id;
$$;
CREATE OR REPLACE FUNCTION tbs_email_approval_payload(r leave_requests,recipient jsonb,token text,expires timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE d jsonb:=tbs_email_request_details(r); base text; link text; type_label text; dates text; days text; period text; rows text; BEGIN
 SELECT app_url INTO base FROM tbs_email_fallback_settings WHERE singleton;
 link:=base||'/email-decision?id='||r.id||'&t='||token;
 type_label:=CASE WHEN r.leave_type IN ('annual','vacation') THEN 'Annual leave / ลาพักร้อน' WHEN r.leave_type='sick' THEN 'Sick leave / ลาป่วย'
  WHEN r.leave_type='personal' THEN 'Personal leave / ลากิจ' WHEN r.leave_type='university' THEN 'University activity / กิจกรรมมหาวิทยาลัย' ELSE initcap(COALESCE(r.leave_type,'')) END;
 SELECT string_agg(to_char(x::date,'FMDD Mon YYYY'),', ' ORDER BY x::date) INTO dates FROM jsonb_array_elements_text(d->'dates') x;
 days:=CASE WHEN position('.' IN r.leave_days::text)>0 THEN rtrim(rtrim(r.leave_days::text,'0'),'.') ELSE r.leave_days::text END;
 period:=CASE WHEN r.half_day_period='morning' THEN ' · Morning / ช่วงเช้า' WHEN r.half_day_period='afternoon' THEN ' · Afternoon / ช่วงบ่าย' ELSE '' END;
 rows:='<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Team / แผนก</td><td style="padding:6px 0">'||tbs_html(r.department)||'</td></tr>'
  ||'<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Type / ประเภท</td><td style="padding:6px 0">'||tbs_html(type_label)||'</td></tr>'
  ||'<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Dates / วันที่</td><td style="padding:6px 0">'||tbs_html(dates)||'</td></tr>'
  ||'<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Days / จำนวนวัน</td><td style="padding:6px 0">'||tbs_html(days||period)||'</td></tr>'
  ||CASE WHEN COALESCE(r.reason,'')<>'' THEN '<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">Reason / เหตุผล</td><td style="padding:6px 0">'||tbs_html(r.reason)||'</td></tr>' ELSE '' END
  ||CASE WHEN d->>'balance' IS NOT NULL THEN '<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Balance / คงเหลือ</td><td style="padding:6px 0">'||tbs_html(d->>'balance')||'</td></tr>' ELSE '' END;
 RETURN jsonb_build_object('to',recipient->>'email','requestId',r.id,
  'subject','Leave approval needed / คำขอลารออนุมัติ: '||(d->>'name'),
  'html','<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:15px;line-height:1.5">'
   ||'<p style="margin:0 0 4px;color:#0e7490;font-weight:bold">TBS HR · Leave approval</p>'
   ||'<h2 style="margin:0 0 16px;font-size:22px">'||tbs_html(d->>'name')||'</h2>'
   ||'<table style="border-collapse:collapse;width:100%;font-size:14px">'||rows||'</table>'
   ||'<p style="margin:24px 0 8px"><a href="'||tbs_html(link||'&action=approve')||'" style="display:inline-block;background:#0891b2;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold">Approve / อนุมัติ</a>'
   ||'&nbsp;&nbsp;<a href="'||tbs_html(link||'&action=reject')||'" style="display:inline-block;border:1px solid #e11d48;color:#be123c;padding:11px 24px;border-radius:10px;text-decoration:none;font-weight:bold">Reject / ไม่อนุมัติ</a></p>'
   ||'<p style="margin:16px 0 0;font-size:12px;color:#64748b">You will confirm on the next page. This link is only for you, works once and expires on '||to_char(expires AT TIME ZONE 'Asia/Bangkok','FMDD Mon YYYY')||'. It came by email because LINE''s monthly message limit has been reached.<br>กดยืนยันในหน้าถัดไป ลิงก์นี้ใช้ได้ครั้งเดียวสำหรับคุณเท่านั้น ส่งทางอีเมลเพราะข้อความ LINE เดือนนี้เต็มแล้ว</p>'
   ||'</div>');
END $$;
CREATE OR REPLACE FUNCTION tbs_queue_email_approval(job_payload jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE rid integer:=tbs_approval_request_id(job_payload); r leave_requests%ROWTYPE; people jsonb; p jsonb; token text; expires timestamptz:=now()+interval '14 days'; BEGIN
 IF rid IS NULL THEN RETURN false; END IF;
 SELECT recipients INTO people FROM tbs_email_fallback_settings WHERE singleton;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(people,'[]'::jsonb)) x WHERE x->>'email' ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN RETURN false; END IF;
 SELECT * INTO r FROM leave_requests WHERE id=rid;
 IF NOT FOUND OR lower(COALESCE(r.status,'')) NOT IN ('pending','awaiting','awaiting approval') THEN RETURN true; END IF;
 FOR p IN SELECT x FROM jsonb_array_elements(people) x WHERE x->>'email' ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' LOOP
  CONTINUE WHEN EXISTS(SELECT 1 FROM tbs_email_decision_links WHERE request_id=rid AND recipient=lower(p->>'email') AND used_at IS NULL AND expires_at>now());
  token:=gen_random_uuid()::text;
  INSERT INTO tbs_email_decision_links(request_id,recipient,recipient_name,token_hash,expires_at)
   VALUES(rid,lower(p->>'email'),COALESCE(NULLIF(p->>'name',''),'Approver'),tbs_token_hash(token),expires);
  INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('email',r.user_id,tbs_email_approval_payload(r,p,token,expires));
 END LOOP;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION tbs_email_fallback_sweep() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE j tbs_sync_jobs%ROWTYPE; n integer:=0; BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_email_fallback_settings WHERE singleton AND line_full_until>now()) THEN RETURN 0; END IF;
 FOR j IN SELECT * FROM tbs_sync_jobs WHERE kind='line' AND completed_generation<generation AND retired_at IS NULL
  AND (lease_token IS NULL OR lease_until<now()) AND tbs_approval_request_id(payload) IS NOT NULL ORDER BY delivery_order FOR UPDATE SKIP LOCKED LOOP
  IF tbs_queue_email_approval(j.payload) THEN
   UPDATE tbs_sync_jobs SET completed_generation=generation,blocked=false,lease_token=NULL,lease_until=NULL,
    last_error='Sent by email: LINE monthly limit reached',updated_at=now() WHERE id=j.id;
   n:=n+1;
  END IF;
 END LOOP;
 RETURN n;
END $$;
DO $$ BEGIN
 IF to_regprocedure('tbs_finish_sync_before_email(uuid,uuid,bigint,text)') IS NULL THEN
  ALTER FUNCTION tbs_finish_sync(uuid,uuid,bigint,text) RENAME TO tbs_finish_sync_before_email;
 END IF;
 IF to_regprocedure('tbs_claim_line_batch_before_email(text)') IS NULL THEN
  ALTER FUNCTION tbs_claim_line_batch(text) RENAME TO tbs_claim_line_batch_before_email;
 END IF;
 IF to_regprocedure('tbs_cancellation_before_email(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_cancellation(text,jsonb) RENAME TO tbs_cancellation_before_email;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_finish_sync(job_id uuid,lease uuid,claimed_generation bigint,error_message text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE j tbs_sync_jobs%ROWTYPE; saved boolean; BEGIN
 IF error_message ILIKE '%(429)%monthly limit%' THEN
  PERFORM pg_advisory_xact_lock(hashtext('tbs_email_fallback'));
  UPDATE tbs_email_fallback_settings SET line_full_until=now()+interval '1 hour' WHERE singleton;
  SELECT * INTO j FROM tbs_sync_jobs WHERE id=job_id AND lease_token=lease AND kind='line';
  IF FOUND AND tbs_queue_email_approval(j.payload) THEN
   saved:=tbs_finish_sync_before_email(job_id,lease,claimed_generation,NULL);
   UPDATE tbs_sync_jobs SET last_error='Sent by email: LINE monthly limit reached' WHERE id=job_id;
  ELSE
   saved:=tbs_finish_sync_before_email(job_id,lease,claimed_generation,error_message);
  END IF;
  PERFORM tbs_email_fallback_sweep();
  RETURN saved;
 END IF;
 saved:=tbs_finish_sync_before_email(job_id,lease,claimed_generation,error_message);
 IF saved THEN
  IF error_message IS NULL THEN
   UPDATE tbs_sync_jobs SET payload=(payload-'html')||jsonb_build_object('htmlRemoved',true) WHERE id=job_id AND kind='email';
  ELSE
   UPDATE tbs_sync_jobs SET blocked=true WHERE id=job_id AND kind='email' AND attempts>=20;
  END IF;
 END IF;
 RETURN saved;
END $$;
CREATE OR REPLACE FUNCTION tbs_claim_line_batch(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
BEGIN
 IF channel='line' THEN
  PERFORM pg_advisory_xact_lock(hashtext('tbs_email_fallback'));
  PERFORM tbs_email_fallback_sweep();
 END IF;
 RETURN QUERY SELECT * FROM tbs_claim_line_batch_before_email(channel);
END $$;
CREATE OR REPLACE FUNCTION tbs_email_decision(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE l tbs_email_decision_links%ROWTYPE; r leave_requests%ROWTYPE; act text:=payload->>'action'; result jsonb; previous text; open boolean; BEGIN
 IF COALESCE(payload->>'id','')!~'^[1-9][0-9]{0,9}$' OR lower(COALESCE(payload->>'token',''))!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR act IS NULL OR act NOT IN ('review','approve','reject') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',404,'error','This link is not valid.');
 END IF;
 SELECT * INTO l FROM tbs_email_decision_links WHERE request_id=(payload->>'id')::integer AND token_hash=tbs_token_hash(lower(payload->>'token'));
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','This link is not valid.'); END IF;
 SELECT * INTO r FROM leave_requests WHERE id=l.request_id;
 open:=lower(COALESCE(r.status,'')) IN ('pending','awaiting','awaiting approval');
 IF act='review' THEN
  RETURN jsonb_build_object('ok',true,'request',tbs_email_request_details(r),'approver',l.recipient_name,'expiresAt',l.expires_at,
   'usedAction',l.used_action,'expired',l.expires_at<=now(),'canDecide',l.used_at IS NULL AND l.expires_at>now() AND open);
 END IF;
 IF l.used_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This link was already used.','request',tbs_email_request_details(r)); END IF;
 IF l.expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'statusCode',410,'error','This link has expired. Please use the HR dashboard.','request',tbs_email_request_details(r)); END IF;
 IF NOT open THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This request has already been decided.','request',tbs_email_request_details(r)); END IF;
 IF act='reject' AND length(COALESCE(payload->>'reason',''))>1000 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Rejection reason must be 1,000 characters or fewer.'); END IF;
 previous:=COALESCE(current_setting('app.tbs_actor_label',true),'');
 PERFORM set_config('app.tbs_actor_label',l.recipient_name||' · Email',true);
 result:=tbs_dashboard_request_v2(act,jsonb_build_object('id',r.id,'expectedRevision',md5(to_jsonb(r)::text))
  ||CASE WHEN act='reject' THEN jsonb_build_object('rejectionReason',COALESCE(payload->>'reason','')) ELSE '{}'::jsonb END);
 PERFORM set_config('app.tbs_actor_label',previous,true);
 IF NOT COALESCE((result->>'ok')::boolean,false) THEN RETURN result; END IF;
 UPDATE tbs_email_decision_links SET used_at=now(),used_action=act WHERE id=l.id;
 SELECT * INTO r FROM leave_requests WHERE id=l.request_id;
 RETURN jsonb_build_object('ok',true,'action',act,'request',tbs_email_request_details(r));
END $$;
CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF operation='email-decision' THEN RETURN tbs_email_decision(payload); END IF;
 RETURN tbs_cancellation_before_email(operation,payload);
END $$;
COMMIT;
