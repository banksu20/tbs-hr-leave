-- All sick notices send once per threshold. Only employees acknowledge them.
-- Leaves notification activation unchanged; does not send any messages.
BEGIN;
CREATE OR REPLACE FUNCTION tbs_sick_ack_card(card jsonb, alert_id uuid, ack_token uuid, thai boolean)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(card,'{contents,footer}',jsonb_build_object('type','box','layout','vertical','spacing','sm','paddingAll','20px','contents',jsonb_build_array(
 jsonb_build_object('type','text','size','xs','color','#64748B','wrap',true,'text',CASE WHEN thai THEN 'กดรับทราบเพื่อยืนยันว่าได้อ่านแล้ว' ELSE 'Please acknowledge that you have read this notice.' END),
 jsonb_build_object('type','button','style','primary','color','#B91C1C','action',jsonb_build_object('type','uri','label',CASE WHEN thai THEN 'รับทราบ' ELSE 'Acknowledge' END,
 'uri','https://liff.line.me/2008617589-89gR1Y3Y/sick-acknowledge?id='||alert_id||'&token='||ack_token))
 )));
$$;
CREATE OR REPLACE FUNCTION tbs_sick_notice_card(card jsonb, alert_id uuid, ack_token uuid, thai boolean, ceo boolean)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN ceo THEN card #- '{contents,footer}'
 ELSE tbs_sick_ack_card(card,alert_id,ack_token,thai) END;
$$;
CREATE OR REPLACE FUNCTION tbs_queue_sick_alert(alert_id uuid, as_of date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE a tbs_sick_alerts%ROWTYPE; e tbs_employees%ROWTYPE; used numeric; lang text; card jsonb; job uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_sick_notification_settings WHERE enabled) THEN RETURN 0; END IF;
 SELECT * INTO a FROM tbs_rebind_sick_alert(alert_id);
 IF a.id IS NULL OR a.acknowledged_at IS NOT NULL THEN RETURN 0; END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=a.user_id AND COALESCE(status,'active')='active';
 used:=tbs_sick_used(a.user_id,least(as_of,make_date(a.year,12,31)));
 IF NOT FOUND OR used<a.threshold THEN
  UPDATE tbs_sick_alerts SET retired_at=now() WHERE id=a.id;
  PERFORM tbs_stop_sick_jobs(a.id); RETURN 0;
 END IF;
 IF a.retired_at IS NOT NULL THEN UPDATE tbs_sick_alerts SET retired_at=NULL WHERE id=a.id; END IF;
 IF a.recipient IS NULL OR a.recipient='' THEN
  IF a.audience='ceo' THEN SELECT ceo_account_id INTO a.recipient FROM tbs_cancellation_line_settings WHERE singleton;
  ELSE a.recipient:=a.user_id; END IF;
  IF a.recipient IS NULL OR a.recipient='' THEN RETURN 0; END IF;
  UPDATE tbs_sick_alerts SET recipient=a.recipient WHERE id=a.id;
 END IF;
 IF EXISTS(SELECT 1 FROM tbs_sick_alert_jobs WHERE tbs_sick_alert_jobs.alert_id=a.id AND token=a.token AND (delivered_at AT TIME ZONE 'Asia/Bangkok')::date>=as_of) THEN RETURN 0; END IF;
 IF EXISTS(SELECT 1 FROM tbs_sick_alert_jobs WHERE tbs_sick_alert_jobs.alert_id=a.id AND token=a.token AND delivered_at IS NOT NULL) THEN RETURN 0; END IF;
 IF a.last_sent_date>=as_of OR EXISTS(SELECT 1 FROM tbs_sick_alert_jobs m JOIN tbs_sync_jobs j ON j.id=m.job_id
  WHERE m.alert_id=a.id AND m.token=a.token AND j.completed_generation<j.generation) THEN RETURN 0; END IF;
 SELECT language INTO lang FROM tbs_sick_language WHERE user_id=a.user_id;
 card:=tbs_sick_notice_card(tbs_sick_flex(jsonb_build_object('name',concat_ws(' ',e.first_name,e.last_name),'code',e.tbs_id,'department',e.department),used,a.threshold,a.year,a.audience='ceo',least(as_of,make_date(a.year,12,31)),COALESCE(lang,'en')),a.id,a.token,COALESCE(lang='th',false) AND a.audience='employee',a.audience='ceo');
 INSERT INTO tbs_sync_jobs(kind,user_id,year,payload) VALUES('line',a.user_id,a.year,jsonb_build_object('to',a.recipient,'messages',jsonb_build_array(card))) RETURNING id INTO job;
 INSERT INTO tbs_sick_alert_jobs(job_id,alert_id,token,sent_date) VALUES(job,a.id,a.token,as_of);
 UPDATE tbs_sick_alerts SET last_sent_date=as_of WHERE id=a.id;
 UPDATE tbs_sick_milestones SET job_id=job WHERE user_id=a.user_id AND year=a.year AND audience=a.audience AND threshold=a.threshold;
 RETURN 1;
END $$;
CREATE OR REPLACE FUNCTION tbs_refresh_sick_jobs() RETURNS void LANGUAGE plpgsql AS $$
DECLARE a tbs_sick_alerts%ROWTYPE; used numeric; e tbs_employees%ROWTYPE; lang text; today date:=(now() AT TIME ZONE 'Asia/Bangkok')::date; card jsonb;
BEGIN
 FOR a IN SELECT * FROM tbs_sick_alerts ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO a FROM tbs_rebind_sick_alert(a.id);
  SELECT * INTO e FROM tbs_employees WHERE user_id=a.user_id;
  used:=tbs_sick_used(a.user_id,least(today,make_date(a.year,12,31)));
  IF COALESCE(e.status,'active')<>'active' OR used<a.threshold THEN
   UPDATE tbs_sick_alerts SET retired_at=COALESCE(retired_at,now()) WHERE id=a.id; a.retired_at:=now();
  ELSE UPDATE tbs_sick_alerts SET retired_at=NULL WHERE id=a.id; a.retired_at:=NULL; END IF;
  UPDATE tbs_sync_jobs j SET completed_generation=generation,blocked=false,last_error=NULL FROM tbs_sick_alert_jobs m
   WHERE j.id=m.job_id AND m.alert_id=a.id AND (a.acknowledged_at IS NOT NULL OR a.retired_at IS NOT NULL OR m.token<>a.token)
   AND j.completed_generation<j.generation AND (j.lease_until IS NULL OR j.lease_until<now());
  IF a.acknowledged_at IS NOT NULL OR a.retired_at IS NOT NULL THEN CONTINUE; END IF;
  UPDATE tbs_sync_jobs j SET completed_generation=generation,blocked=false,last_error=NULL FROM tbs_sick_alert_jobs m
   WHERE j.id=m.job_id AND m.alert_id=a.id AND m.token=a.token AND j.first_attempt_at IS NULL AND j.completed_generation<j.generation
   AND EXISTS(SELECT 1 FROM tbs_sick_alert_jobs delivered WHERE delivered.alert_id=a.id AND delivered.token=a.token AND delivered.delivered_at IS NOT NULL);
  SELECT language INTO lang FROM tbs_sick_language WHERE user_id=a.user_id;
  card:=tbs_sick_notice_card(tbs_sick_flex(jsonb_build_object('name',concat_ws(' ',e.first_name,e.last_name),'code',e.tbs_id,'department',e.department),used,a.threshold,a.year,a.audience='ceo',least(today,make_date(a.year,12,31)),COALESCE(lang,'en')),a.id,a.token,COALESCE(lang='th',false) AND a.audience='employee',a.audience='ceo');
  UPDATE tbs_sync_jobs j SET payload=jsonb_set(j.payload,'{messages}',jsonb_build_array(card)) FROM tbs_sick_alert_jobs m
   WHERE j.id=m.job_id AND m.alert_id=a.id AND m.token=a.token AND j.completed_generation<j.generation AND j.first_attempt_at IS NULL;
 END LOOP;
END $$;
COMMIT;
