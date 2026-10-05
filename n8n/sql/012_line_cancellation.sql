-- Additive; delivery stays off until the LIFF confirmation page is deployed.
BEGIN;
CREATE TABLE IF NOT EXISTS tbs_cancellation_line_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 ceo_account_id text NOT NULL
);
INSERT INTO tbs_cancellation_line_settings(singleton,ceo_account_id) VALUES(true,'U715bf0a842fd10bebdeb446c45c3ba38') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tbs_cancellation_line_messages (
 cancellation_id bigint PRIMARY KEY REFERENCES tbs_cancellation_requests(id),
 decision_token uuid NOT NULL DEFAULT gen_random_uuid(), approver_id text NOT NULL,
 job_id uuid, decided_by text, decided_at timestamptz
);
CREATE OR REPLACE FUNCTION tbs_queue_cancellation_line(target_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE c tbs_cancellation_requests%ROWTYPE; r leave_requests%ROWTYPE; setting tbs_cancellation_line_settings%ROWTYPE;
 m tbs_cancellation_line_messages%ROWTYPE; link text; message jsonb; job uuid;
BEGIN
 SELECT * INTO setting FROM tbs_cancellation_line_settings WHERE singleton;
 IF NOT FOUND OR NOT setting.enabled THEN RETURN false; END IF;
 SELECT * INTO c FROM tbs_cancellation_requests WHERE id=target_id FOR UPDATE;
 IF NOT FOUND OR c.status<>'Pending' THEN RETURN false; END IF;
 SELECT * INTO r FROM leave_requests WHERE id=c.request_id;
 IF r.status<>'Approved' OR c.request_revision IS DISTINCT FROM md5(to_jsonb(r)::text) THEN RETURN false; END IF;
 INSERT INTO tbs_cancellation_line_messages(cancellation_id,approver_id) VALUES(c.id,setting.ceo_account_id) ON CONFLICT DO NOTHING;
 SELECT * INTO m FROM tbs_cancellation_line_messages WHERE cancellation_id=c.id FOR UPDATE;
 IF m.job_id IS NOT NULL THEN RETURN false; END IF;
 link:='https://liff.line.me/2008617589-89gR1Y3Y/cancel-decision?id='||c.id||'&token='||m.decision_token;
 message:=jsonb_build_object('to',m.approver_id,'messages',jsonb_build_array(jsonb_build_object('type','flex','altText','Leave cancellation request #'||c.id,
 'contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','spacing','md','contents',jsonb_build_array(
 jsonb_build_object('type','text','text','CANCEL LEAVE / ขอยกเลิกลา','weight','bold','color','#B7791F','wrap',true),
 jsonb_build_object('type','text','text',COALESCE(NULLIF(r.user_name,''),'Employee'),'weight','bold','wrap',true),
 jsonb_build_object('type','text','text',array_to_string(c.dates,', '),'wrap',true),
 jsonb_build_object('type','text','text',r.leave_type||' · '||trim_scale(r.leave_days/cardinality(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date))*cardinality(c.dates))||' day(s)'||COALESCE(' · '||r.half_day_period,''),'wrap',true),
 jsonb_build_object('type','text','text',left(COALESCE(NULLIF(c.reason,''),'No reason supplied'),1000),'wrap',true),
 jsonb_build_object('type','text','text','Leave stays approved until cancellation is approved.','size','sm','wrap',true))),
 'footer',jsonb_build_object('type','box','layout','vertical','spacing','sm','contents',jsonb_build_array(
 jsonb_build_object('type','button','style','primary','color','#B7791F','action',jsonb_build_object('type','uri','label','Approve cancellation','uri',link||'&action=approve')),
 jsonb_build_object('type','button','style','secondary','action',jsonb_build_object('type','uri','label','Reject cancellation','uri',link||'&action=reject'))))))));
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',c.user_id,message) RETURNING id INTO job;
 UPDATE tbs_cancellation_line_messages SET job_id=job WHERE cancellation_id=c.id;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION tbs_new_cancellation_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM tbs_queue_cancellation_line(NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tbs_new_cancellation_line ON tbs_cancellation_requests;
CREATE TRIGGER tbs_new_cancellation_line AFTER INSERT ON tbs_cancellation_requests FOR EACH ROW EXECUTE FUNCTION tbs_new_cancellation_line();

CREATE OR REPLACE FUNCTION tbs_line_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c tbs_cancellation_requests%ROWTYPE; r leave_requests%ROWTYPE; m tbs_cancellation_line_messages%ROWTYPE; result jsonb;
BEGIN
 IF operation IS NULL OR operation NOT IN ('line-review','line-approve','line-reject') OR COALESCE(payload->>'id','')!~'^[1-9][0-9]*$' THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid cancellation link'); END IF;
 SELECT * INTO m FROM tbs_cancellation_line_messages WHERE cancellation_id=(payload->>'id')::bigint;
 IF NOT FOUND OR m.approver_id IS DISTINCT FROM payload->>'accountId' OR m.decision_token::text IS DISTINCT FROM payload->>'token' THEN
 RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Open this message using the CEO LINE account.'); END IF;
 SELECT * INTO c FROM tbs_cancellation_requests WHERE id=m.cancellation_id;
 -- Same lock ordering as dashboard decisions and employee edits.
 PERFORM 1 FROM tbs_employees WHERE user_id=c.user_id FOR UPDATE;
 SELECT * INTO r FROM leave_requests WHERE id=c.request_id FOR UPDATE;
 SELECT * INTO c FROM tbs_cancellation_requests WHERE id=m.cancellation_id FOR UPDATE;
 IF c.status<>'Pending' OR r.status<>'Approved' OR c.request_revision IS DISTINCT FROM md5(to_jsonb(r)::text) THEN
 RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Already decided or leave changed. This message cannot make another decision.'); END IF;
 IF operation='line-review' THEN
 RETURN jsonb_build_object('ok',true,'request',jsonb_build_object('id',c.id,'name',r.user_name,'type',r.leave_type,'dates',c.dates,'reason',c.reason,'period',r.half_day_period,'days',r.leave_days/cardinality(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date))*cardinality(c.dates)));
 END IF;
 result:=tbs_cancellation(substr(operation,6),jsonb_build_object('id',c.id,'reason',COALESCE(payload->>'reason','')));
 IF result->>'ok'='true' THEN
 UPDATE tbs_cancellation_line_messages SET decided_by=payload->>'accountId',decided_at=now() WHERE cancellation_id=c.id;
 UPDATE tbs_change_history SET actor='CEO via verified LINE' WHERE entity='employee_cancellation' AND record_id=c.request_id::text AND after_value->>'id'=c.id::text AND action=substr(operation,6)||' cancellation';
 END IF;
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid cancellation link');
END $$;
COMMIT;
