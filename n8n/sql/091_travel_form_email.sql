BEGIN;
CREATE OR REPLACE FUNCTION tbs_mask_email(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN v ~ '^[^@\s]+@[^@\s]+$' THEN left(v,1)||'•••'||substring(v from '@.*$') END;
$$;
CREATE OR REPLACE FUNCTION tbs_travel_form_email(b jsonb,actor tbs_dashboard_accounts) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE m date:=tbs_travel_payout_month(b->>'month'); uid text:=b->>'userId'; pdf text:=COALESCE(b->>'pdf',''); mail text; e tbs_employees%ROWTYPE;
 f jsonb; who text; code text; total numeric; receipts integer; label text; body text; BEGIN
 IF actor.role NOT IN ('admin','ceo','hr','accounting') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Operation not permitted'); END IF;
 IF m IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose a month.'); END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=uid;
 IF e.user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Employee not found.'); END IF;
 SELECT accounting_email INTO mail FROM tbs_travel_settings WHERE singleton;
 IF mail IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Add the accounting email in Travel settings first.'); END IF;
 IF length(pdf) NOT BETWEEN 200 AND 6000000 OR left(pdf,7)<>'JVBERi0' OR pdf!~'^[A-Za-z0-9+/]+={0,2}$' THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','The PDF could not be read. Try again.');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('tbs_travel_form_email:'||uid));
 IF EXISTS(SELECT 1 FROM tbs_sync_jobs WHERE kind='email' AND user_id=uid AND payload->>'form'=to_char(m,'YYYY-MM') AND created_at>now()-interval '1 minute') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',429,'error','This form was just sent. Wait a minute before sending it again.');
 END IF;
 f:=COALESCE((SELECT data FROM tbs_travel_forms WHERE user_id=uid AND month=m),tbs_travel_form_default(uid,m));
 who:=COALESCE(NULLIF(btrim(f->>'nameTh'),''),btrim(concat_ws(' ',e.first_name,e.last_name)));
 code:=CASE WHEN e.employment_type='intern' THEN 'INT-'||lpad(COALESCE(e.intern_number,0)::text,3,'0') ELSE 'TBS-'||lpad(COALESCE(e.tbs_id,0)::text,3,'0') END;
 SELECT COALESCE(sum(CASE WHEN COALESCE(x->>'amount','')~'^-?[0-9]+(\.[0-9]+)?$' THEN (x->>'amount')::numeric END),0) INTO total FROM jsonb_array_elements(COALESCE(f->'rows','[]'::jsonb)) x;
 receipts:=jsonb_array_length(tbs_travel_form_evidence(uid,m));
 label:=to_char(m,'FMMonth YYYY');
 body:=tbs_mail_text('ใบขอเบิกค่าใช้จ่าย · Reimbursement form',13,'#06c755',true)
  ||tbs_mail_text(tbs_html(who),20,'#111111',true,6)
  ||tbs_mail_text(tbs_html(code||' · '||COALESCE(NULLIF(e.department,''),'—')||' · '||label),14,'#6b7280',false,2)
  ||tbs_mail_box(tbs_mail_text('รวมทั้งสิ้น · Total',13,'#6b7280')||tbs_mail_text('฿'||to_char(total,'FM999,999,990.00'),26,'#111111',true,2)
   ||tbs_mail_text(receipts||' ใบเสร็จ · receipt'||CASE WHEN receipts=1 THEN '' ELSE 's' END,13,'#6b7280',false,4),'#f3f4f6',16)
  ||tbs_mail_text('ไฟล์ PDF แนบมาด้วย: หน้าแรกคือใบขอเบิก ตามด้วยหลักฐานการจ่ายเงิน พิมพ์ ลงชื่อ แล้วเก็บเข้าแฟ้ม',14,'#111111',false,16)
  ||tbs_mail_text('The PDF is attached: page 1 is the form, then the payment evidence. Print it, sign it and file it.',14,'#374151',false,6);
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('email',uid,jsonb_build_object(
  'to',mail,'form',to_char(m,'YYYY-MM'),
  'subject','ใบขอเบิกค่าใช้จ่าย / Reimbursement form: '||who||' · '||label,
  'html',tbs_mail_bubble(body,'',tbs_html('Sent from TBS HR by '||actor.username||'.'),'Reimbursement form for '||who||' · '||label),
  'attachment',jsonb_build_object('name','Reimbursement '||code||' '||to_char(m,'YYYY-MM')||'.pdf','mime','application/pdf','data',pdf)));
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'travel-form-email',uid||' '||to_char(m,'YYYY-MM'));
 RETURN jsonb_build_object('ok',true,'sentTo',tbs_mask_email(mail));
END $$;

DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_form_email(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_form_email;
 END IF;
 IF to_regprocedure('tbs_finish_sync_before_form_email(uuid,uuid,bigint,text)') IS NULL THEN
  ALTER FUNCTION tbs_finish_sync(uuid,uuid,bigint,text) RENAME TO tbs_finish_sync_before_form_email;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; r jsonb; BEGIN
 IF op='travel-form-email' THEN
  SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  RETURN tbs_travel_form_email(COALESCE(payload->'body','{}'::jsonb),actor);
 END IF;
 r:=tbs_dashboard_auth_before_form_email(payload);
 IF op IN ('travel-form','travel-form-save','travel-form-reset') AND COALESCE((r->>'ok')::boolean,false) THEN
  r:=r||jsonb_build_object('mailTo',(SELECT tbs_mask_email(accounting_email) FROM tbs_travel_settings WHERE singleton));
 END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION tbs_finish_sync(job_id uuid,lease uuid,claimed_generation bigint,error_message text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE saved boolean; BEGIN
 saved:=tbs_finish_sync_before_form_email(job_id,lease,claimed_generation,error_message);
 UPDATE tbs_sync_jobs SET payload=(payload-'attachment')||jsonb_build_object('attachmentRemoved',true)
  WHERE id=job_id AND kind='email' AND payload ? 'attachment' AND (completed_generation>=generation OR blocked);
 RETURN saved;
END $$;
COMMIT;
