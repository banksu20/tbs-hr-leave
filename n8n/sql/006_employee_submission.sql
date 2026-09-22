BEGIN;
CREATE OR REPLACE FUNCTION tbs_approval_message(request leave_requests, approvers jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('to',approvers,'messages',jsonb_build_array(jsonb_build_object(
 'type','flex','altText',left('New leave request: '||request.user_name,300),
 'contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','contents',jsonb_build_array(
 jsonb_build_object('type','text','text','NEW LEAVE REQUEST','weight','bold','color','#009944'),
 jsonb_build_object('type','text','text',left(request.user_name,200),'weight','bold','wrap',true),
 jsonb_build_object('type','text','text',left(request.selected_dates,1800),'wrap',true),
 jsonb_build_object('type','text','text',request.leave_type||' · '||request.leave_days||' day(s)'||COALESCE(' · '||request.half_day_period,''),'wrap',true),
 jsonb_build_object('type','text','text',left(COALESCE(NULLIF(request.reason,''),'No reason supplied'),1800),'wrap',true))),
 'footer',jsonb_build_object('type','box','layout','vertical','spacing','sm','contents',jsonb_build_array(
 jsonb_build_object('type','button','style','primary','action',jsonb_build_object('type','postback','label','Approve',
 'data','action=approve&db_id='||request.id||'&userId='||request.user_id||'&revision='||md5(to_jsonb(request)::text)||'&token='||request.decision_token)),
 jsonb_build_object('type','button','style','secondary','action',jsonb_build_object('type','uri','label','Reject',
 'uri','https://liff.line.me/2008617589-89gR1Y3Y/reject-form?db_id='||request.id||'&userId='||request.user_id||'&revision='||md5(to_jsonb(request)::text)||'&token='||request.decision_token))
 ))))));
$$;
CREATE OR REPLACE FUNCTION tbs_employee_request(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; dates date[]; employee tbs_employees%ROWTYPE; request leave_requests%ROWTYPE; amount numeric; period text; kind text;
BEGIN
 SELECT * INTO employee FROM tbs_employees WHERE user_id=payload->>'userId' AND COALESCE(status,'active')='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Active employee not found'); END IF;
 IF jsonb_typeof(payload->'selectedDates') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select the exact leave dates'); END IF;
 SELECT array_agg(value::date ORDER BY value::date) INTO dates FROM jsonb_array_elements_text(payload->'selectedDates');
 IF dates IS NULL OR cardinality(dates) NOT BETWEEN 1 AND 366 OR cardinality(dates)<>(SELECT count(DISTINCT d) FROM unnest(dates) d) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid or duplicate dates'); END IF;
 IF jsonb_typeof(payload->'approverIds') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'approverIds')=0 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','No approver is configured'); END IF;
 amount:=(payload->>'leaveDays')::numeric;period:=NULLIF(payload->>'halfDayPeriod','');
 kind:=CASE WHEN lower(payload->>'leaveType')='vacation' THEN 'annual' ELSE lower(payload->>'leaveType') END;
 IF kind IS NULL OR kind NOT IN ('annual','sick','personal') OR amount IS NULL OR amount/cardinality(dates) NOT IN (0.25,0.5,1)
 OR (amount/cardinality(dates)=0.5 AND (period IS NULL OR period NOT IN ('morning','afternoon')))
 OR (amount/cardinality(dates)<>0.5 AND period IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid leave type, duration or half-day period'); END IF;
 INSERT INTO leave_requests(user_id,user_name,department,leave_type,leave_days,start_date,end_date,selected_dates,reason,status,source,half_day_period)
 VALUES(employee.user_id,concat_ws(' ',employee.first_name,employee.last_name),employee.department,kind,amount,dates[1],dates[cardinality(dates)],array_to_string(dates,','),COALESCE(payload->>'reason',''),'Pending','line',period) RETURNING * INTO request;
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',employee.user_id,tbs_approval_message(request,payload->'approverIds'));
 RETURN to_jsonb(request)||jsonb_build_object('ok',true,'revision',md5(to_jsonb(request)::text));
EXCEPTION WHEN exclusion_violation THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Overlapping leave exists. Review existing requests.');
WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request');
END;
$$;
COMMIT;
