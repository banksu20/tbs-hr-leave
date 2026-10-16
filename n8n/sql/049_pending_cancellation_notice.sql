BEGIN;
-- Informational only: no decision buttons and no replay of historic cancellations.
CREATE OR REPLACE FUNCTION tbs_pending_cancellation_card(r jsonb,dates date[]) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE card jsonb; remaining date[]; detail text;
BEGIN
 card:=tbs_cancellation_result_flex(r,'cancel',dates);
 SELECT COALESCE(array_agg(d ORDER BY d),'{}'::date[]) INTO remaining
 FROM unnest(tbs_request_dates(r->>'selected_dates',(r->>'start_date')::date,(r->>'end_date')::date)) d WHERE NOT(d=ANY(dates));
 card:=jsonb_set(card,'{altText}',to_jsonb(left('Pending leave cancelled · '||COALESCE(r->>'user_name','Employee')||' · #'||(r->>'id'),400)));
 card:=jsonb_set(card,'{contents,body,contents,0,text}',to_jsonb('PENDING LEAVE CANCELLED / ยกเลิกคำขอลา'::text));
 detail:='The employee cancelled these pending dates. No approval is needed. / พนักงานยกเลิกวันที่เหล่านี้แล้ว ไม่ต้องอนุมัติ';
 IF cardinality(remaining)>0 THEN
  detail:=detail||E'\nStill pending / วันที่ยังรออนุมัติ: '||tbs_card_dates(remaining)||E'\nThe old card is outdated. Review the remaining dates in the dashboard.';
 ELSE detail:=detail||E'\nThe whole request is cancelled. Please ignore the old approval card. / กรุณาข้ามการ์ดอนุมัติเดิม';
 END IF;
 card:=jsonb_set(card,'{contents,body,contents}',(card#>'{contents,body,contents}')||jsonb_build_array(jsonb_build_object('type','text','text',detail,'wrap',true,'size','sm','color','#475569')));
 RETURN card;
END $$;
CREATE OR REPLACE FUNCTION tbs_queue_cancellation_result(r jsonb, account text, event text, dates date[], note text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
DECLARE recipient text;
BEGIN
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',r->>'user_id',jsonb_build_object('to',account,'messages',jsonb_build_array(tbs_cancellation_result_flex(r,event,dates,note))));
 IF event='cancel' AND r->>'status'='Pending' THEN
  SELECT ceo_account_id INTO recipient FROM tbs_cancellation_line_settings WHERE singleton;
  IF NULLIF(btrim(recipient),'') IS NULL THEN RAISE EXCEPTION 'CEO cancellation notification recipient is not configured'; END IF;
  INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',r->>'user_id',jsonb_build_object('to',recipient,'pendingCancellationRequestId',r->>'id','messages',jsonb_build_array(tbs_pending_cancellation_card(r,dates))));
 END IF;
END $$;
COMMIT;
