-- Apply after 014 through n8n PostgreSQL. No historical notifications are replayed.
BEGIN;
CREATE OR REPLACE FUNCTION tbs_approval_message(request leave_requests, approvers jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('to',approvers,'messages',jsonb_build_array(jsonb_build_object(
 'type','flex','altText',left('New leave request: '||request.user_name,300),
 'contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','contents',jsonb_build_array(
 jsonb_build_object('type','text','text','NEW LEAVE REQUEST','weight','bold','color','#009944'),
 jsonb_build_object('type','text','text',left(request.user_name,200),'weight','bold','wrap',true),
 jsonb_build_object('type','text','text',tbs_card_dates(tbs_request_dates(request.selected_dates,request.start_date::date,request.end_date::date)),'wrap',true),
 jsonb_build_object('type','text','text',request.leave_type||' · '||request.leave_days||' day(s)'||COALESCE(' · '||request.half_day_period,''),'wrap',true),
 jsonb_build_object('type','text','text',left(COALESCE(NULLIF(request.reason,''),'No reason supplied'),1800),'wrap',true))),
 'footer',jsonb_build_object('type','box','layout','vertical','spacing','sm','contents',jsonb_build_array(
 jsonb_build_object('type','button','style','primary','action',jsonb_build_object('type','postback','label','Approve',
 'data','action=approve&db_id='||request.id||'&userId='||request.user_id||'&revision='||md5(to_jsonb(request)::text)||'&token='||request.decision_token)),
 jsonb_build_object('type','button','style','secondary','action',jsonb_build_object('type','uri','label','Reject',
 'uri','https://liff.line.me/2008617589-89gR1Y3Y/reject-form?db_id='||request.id||'&userId='||request.user_id||'&revision='||md5(to_jsonb(request)::text)||'&token='||request.decision_token))
 ))))));
$$;
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
 jsonb_build_object('type','text','text',tbs_card_dates(c.dates),'wrap',true),
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
CREATE OR REPLACE FUNCTION tbs_expire_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c tbs_cancellation_requests%ROWTYPE; boss text;
BEGIN
 IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
 FOR c IN UPDATE tbs_cancellation_requests SET status='Expired',decided_at=now(),decision_reason='Leave changed; submit a new cancellation request.'
   WHERE request_id=NEW.id AND status='Pending' RETURNING * LOOP
   PERFORM tbs_queue_cancellation_result(to_jsonb(OLD),c.account_user_id,'expired',c.dates,c.decision_reason);
   SELECT approver_id INTO boss FROM tbs_cancellation_line_messages WHERE cancellation_id=c.id AND job_id IS NOT NULL;
   IF boss IS NOT NULL AND boss<>c.account_user_id THEN
    PERFORM tbs_queue_cancellation_result(to_jsonb(OLD),boss,'expired',c.dates,c.decision_reason);
   END IF;
 END LOOP;
 END IF;
 RETURN NEW;
END $$;

-- Stable enqueue order, independent of retries and timestamps shared by a transaction.
CREATE SEQUENCE IF NOT EXISTS tbs_sync_order;
ALTER TABLE tbs_sync_jobs ADD COLUMN IF NOT EXISTS delivery_order bigint;
DO $$ DECLARE j record; BEGIN
 FOR j IN SELECT id FROM tbs_sync_jobs WHERE delivery_order IS NULL ORDER BY created_at,id LOOP
 UPDATE tbs_sync_jobs SET delivery_order=nextval('tbs_sync_order') WHERE id=j.id;
 END LOOP;
END $$;
ALTER TABLE tbs_sync_jobs ALTER COLUMN delivery_order SET DEFAULT nextval('tbs_sync_order');
ALTER TABLE tbs_sync_jobs ALTER COLUMN delivery_order SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tbs_sync_delivery_order ON tbs_sync_jobs(delivery_order);
CREATE OR REPLACE FUNCTION tbs_line_recipients(payload jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(payload->'to')='array' THEN ARRAY(SELECT jsonb_array_elements_text(payload->'to')) ELSE ARRAY[payload->>'to'] END;
$$;
CREATE OR REPLACE FUNCTION tbs_claim_line_batch(channel text) RETURNS SETOF tbs_sync_jobs LANGUAGE plpgsql AS $$
DECLARE job tbs_sync_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('tbs_sync_'||channel));
 IF channel='line' THEN
  UPDATE tbs_sync_jobs SET blocked=true,last_error='Delivery outcome needs review: retry window expired'
  WHERE kind='line' AND completed_generation<generation AND first_attempt_at<now()-interval '23 hours';
  -- One outstanding delivery per recipient. A failed/blocked predecessor holds later messages for that recipient.
  RETURN QUERY WITH candidates AS (
   SELECT j.id FROM tbs_sync_jobs j WHERE j.kind='line' AND j.completed_generation<j.generation AND NOT j.blocked
   AND (j.lease_until IS NULL OR j.lease_until<now())
   AND NOT EXISTS(SELECT 1 FROM tbs_sync_jobs prior WHERE prior.kind='line' AND prior.completed_generation<prior.generation
    AND prior.delivery_order<j.delivery_order AND tbs_line_recipients(prior.payload)&&tbs_line_recipients(j.payload))
   ORDER BY j.delivery_order FOR UPDATE OF j SKIP LOCKED LIMIT 20
  ) UPDATE tbs_sync_jobs j SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=j.attempts+1,
     first_attempt_at=COALESCE(j.first_attempt_at,now()) FROM candidates c WHERE j.id=c.id RETURNING j.*;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM tbs_sync_jobs WHERE kind=channel AND lease_token IS NOT NULL AND lease_until>now()) THEN RETURN; END IF;
 SELECT * INTO job FROM tbs_sync_jobs WHERE kind=channel AND completed_generation<generation AND NOT blocked
 AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE tbs_sync_jobs SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,
 first_attempt_at=COALESCE(first_attempt_at,now()) WHERE id=job.id RETURNING * INTO job;
 RETURN NEXT job;
END $$;
CREATE OR REPLACE FUNCTION tbs_delivery_status() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('ok',true,
 'pending',(SELECT count(*) FROM tbs_sync_jobs WHERE completed_generation<generation),
 'failed',(SELECT count(*) FROM tbs_sync_jobs WHERE completed_generation<generation AND (blocked OR last_error IS NOT NULL)),
 'jobs',COALESCE((SELECT jsonb_agg(row_to_json(x)) FROM (
 SELECT j.id,j.kind,j.attempts,j.blocked,j.created_at,j.updated_at,
 CASE WHEN j.blocked THEN 'Needs delivery review' WHEN j.last_error IS NOT NULL THEN 'Retry scheduled' ELSE 'Queued' END status,
 COALESCE(NULLIF(concat_ws(' ',e.first_name,e.last_name),''),'Employee') name
 FROM tbs_sync_jobs j LEFT JOIN tbs_employees e ON e.user_id=j.user_id
 WHERE j.completed_generation<j.generation ORDER BY j.blocked DESC,(j.last_error IS NOT NULL) DESC,j.delivery_order LIMIT 30
 ) x),'[]'::jsonb));
$$;
COMMIT;
