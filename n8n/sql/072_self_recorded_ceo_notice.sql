BEGIN;
INSERT INTO tbs_self_recorded_leave SELECT user_id FROM tbs_employees WHERE tbs_id=1 AND COALESCE(status,'active')='active' ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION tbs_self_record_notice(request leave_requests,dates date[],removed boolean,note text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE ceo text; message jsonb; nick text; BEGIN
 SELECT ceo_account_id INTO ceo FROM tbs_cancellation_line_settings WHERE singleton;
 IF COALESCE(ceo,'')='' OR tbs_resolve_employee(ceo)=request.user_id OR cardinality(dates) IS NULL THEN RETURN 0; END IF;
 SELECT COALESCE(NULLIF(nickname,''),first_name) INTO nick FROM tbs_employees WHERE user_id=request.user_id;
 request.selected_dates:=array_to_string(dates,',');
 request.start_date:=dates[1];
 request.end_date:=dates[cardinality(dates)];
 request.reason:=COALESCE(note,'');
 message:=tbs_approval_message(request,'[]'::jsonb) #- '{messages,0,contents,footer}';
 message:=jsonb_set(message,'{to}',to_jsonb(ceo));
 message:=jsonb_set(message,'{messages,0,altText}',to_jsonb(left(CASE WHEN removed THEN 'Leave removed (FYI): ' ELSE 'Leave recorded (FYI): ' END||request.user_name,300)));
 message:=jsonb_set(message,'{messages,0,contents,body,contents,0,text}',to_jsonb(CASE WHEN removed THEN 'แจ้งเพื่อทราบ: ลบวันลา / FYI: leave removed' ELSE 'แจ้งเพื่อทราบ: บันทึกการลา / FYI: leave recorded' END));
 message:=jsonb_set(message,'{messages,0,contents,body,contents,0,wrap}','true'::jsonb);
 IF removed THEN
  message:=jsonb_set(message,'{messages,0,contents,body,contents,0,color}','"#B45309"'::jsonb);
 END IF;
 message:=jsonb_insert(message,'{messages,0,contents,body,contents,-1}',jsonb_build_object('type','text','size','sm','color','#64748B','wrap',true,
  'text',CASE WHEN removed THEN nick||' ลบวันลาเองผ่าน LINE ไม่ต้องดำเนินการ / '||nick||' removed these dates in LINE. No action is needed.'
   ELSE nick||' บันทึกการลาเองผ่าน LINE ไม่ต้องดำเนินการ / '||nick||' recorded this in LINE. No action is needed.' END),true);
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',request.user_id,message);
 RETURN 1;
END $$;
DO $$ BEGIN
 IF to_regprocedure('tbs_employee_request_before_ceo_notice(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_employee_request(jsonb) RENAME TO tbs_employee_request_before_ceo_notice;
 END IF;
 IF to_regprocedure('tbs_cancellation_before_ceo_notice(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_cancellation(text,jsonb) RENAME TO tbs_cancellation_before_ceo_notice;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_employee_request(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:=tbs_employee_request_before_ceo_notice(payload); request leave_requests%ROWTYPE; dates date[]; BEGIN
 IF COALESCE((result->>'ok')::boolean,false) AND COALESCE((result->>'selfRecorded')::boolean,false) THEN
  SELECT * INTO request FROM leave_requests WHERE id=(result->>'id')::integer;
  SELECT array_agg(start_date::date ORDER BY start_date) INTO dates FROM leave_requests WHERE id IN (SELECT value::integer FROM jsonb_array_elements_text(result->'ids'));
  request.leave_days:=(SELECT sum(leave_days) FROM leave_requests WHERE id IN (SELECT value::integer FROM jsonb_array_elements_text(result->'ids')));
  request.selected_dates:=array_to_string(dates,',');
  request.start_date:=dates[1];
  request.end_date:=dates[cardinality(dates)];
  IF tbs_self_record_notice(request,dates,false,payload->>'reason')>0 THEN result:=result||jsonb_build_object('ceoNotified',true); END IF;
 END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE request leave_requests%ROWTYPE; result jsonb; dates date[]; BEGIN
 IF operation='request' AND COALESCE(payload->>'id','')~'^[1-9][0-9]*$' THEN
  SELECT * INTO request FROM leave_requests WHERE id=(payload->>'id')::integer;
 END IF;
 result:=tbs_cancellation_before_ceo_notice(operation,payload);
 IF operation='request' AND request.id IS NOT NULL AND COALESCE((result->>'ok')::boolean,false) AND COALESCE((result->>'selfRecorded')::boolean,false) THEN
  SELECT array_agg(value::date ORDER BY value::date) INTO dates FROM jsonb_array_elements_text(payload->'dates');
  request.leave_days:=request.leave_days*cardinality(dates)/GREATEST(cardinality(tbs_request_dates(request.selected_dates,request.start_date::date,request.end_date::date)),1);
  request.selected_dates:=array_to_string(dates,',');
  request.start_date:=dates[1];
  request.end_date:=dates[cardinality(dates)];
  IF tbs_self_record_notice(request,dates,true,payload->>'reason')>0 THEN result:=result||jsonb_build_object('ceoNotified',true); END IF;
 END IF;
 RETURN result;
END $$;
COMMIT;
