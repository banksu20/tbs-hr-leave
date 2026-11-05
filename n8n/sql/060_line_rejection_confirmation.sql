BEGIN;
DO $$ BEGIN
 IF to_regprocedure('tbs_line_decision_before_confirmation(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_line_decision(text,jsonb) RENAME TO tbs_line_decision_before_confirmation;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_line_decision(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; r leave_requests%ROWTYPE; recipient text:=payload->>'accountId'; card jsonb;
BEGIN
 result:=tbs_line_decision_before_confirmation(operation,payload);
 IF operation='reject' AND COALESCE((result->>'ok')::boolean,false) THEN
  SELECT * INTO r FROM leave_requests WHERE id=(payload->>'id')::integer;
  -- Isolated fixtures cannot reach real recipients. Only confirm a real saved decision.
  IF r.id IS NOT NULL AND r.status='Rejected' AND
   (recipient=(SELECT ceo_account_id FROM tbs_cancellation_line_settings WHERE singleton)
    OR (EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=r.user_id AND employment_type='intern') AND tbs_intern_approvers() ? recipient)) THEN
   card:=jsonb_build_object('type','flex','altText','Rejection saved / บันทึกการไม่อนุมัติแล้ว · #'||r.id,
    'contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','spacing','md','contents',jsonb_build_array(
     jsonb_build_object('type','text','text','Rejection saved','weight','bold','color','#DC2626','size','lg'),
     jsonb_build_object('type','text','text','บันทึกการไม่อนุมัติแล้ว','wrap',true,'size','sm'),
     jsonb_build_object('type','text','text',COALESCE(NULLIF(r.user_name,''),'Leave request')||' · #'||r.id,'wrap',true,'weight','bold'),
     jsonb_build_object('type','text','text',array_to_string(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date),', '),'wrap',true,'size','sm'),
     jsonb_build_object('type','text','text','This request is rejected. No further action is needed. / คำขอนี้ไม่อนุมัติแล้ว ไม่ต้องดำเนินการซ้ำ','wrap',true,'size','sm')
    ))));
   INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',r.user_id,jsonb_build_object('to',recipient,'messages',jsonb_build_array(card),'rejectionConfirmationRequestId',r.id));
  END IF;
 END IF;
 RETURN result;
END $$;
COMMIT;
