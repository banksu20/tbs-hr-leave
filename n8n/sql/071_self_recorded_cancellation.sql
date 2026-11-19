BEGIN;
DO $$
BEGIN
 IF to_regprocedure('tbs_cancellation_before_self_record(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_cancellation(text,jsonb) RENAME TO tbs_cancellation_before_self_record;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_self_record_label(uid text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(e.nickname,''),NULLIF(concat_ws(' ',e.first_name,e.last_name),''),'Employee')||' via LINE (self-recorded)' FROM tbs_employees e WHERE e.user_id=uid;
$$;
CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId'); r leave_requests%ROWTYPE; dates date[]; result jsonb; previous text;
BEGIN
 IF uid IS NULL OR operation NOT IN ('employee-list','request') OR NOT EXISTS(SELECT 1 FROM tbs_self_recorded_leave WHERE user_id=uid) THEN
  RETURN tbs_cancellation_before_self_record(operation,payload);
 END IF;
 IF operation='employee-list' THEN
  RETURN tbs_cancellation_before_self_record(operation,payload)||jsonb_build_object('selfRecorded',true);
 END IF;
 IF COALESCE(payload->>'id','')!~'^[1-9][0-9]*$' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid cancellation action'); END IF;
 PERFORM 1 FROM tbs_employees WHERE user_id=uid AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Active employee not found'); END IF;
 SELECT * INTO r FROM leave_requests WHERE id=(payload->>'id')::int AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Leave request not found'); END IF;
 IF payload->>'revision' IS DISTINCT FROM md5(to_jsonb(r)::text) OR r.status NOT IN ('Pending','Approved') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Leave changed. Refresh and try again.'); END IF;
 IF jsonb_typeof(payload->'dates') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select valid dates from this request'); END IF;
 SELECT array_agg(value::date ORDER BY value::date) INTO dates FROM jsonb_array_elements_text(payload->'dates');
 IF COALESCE(cardinality(dates),0)=0 OR cardinality(dates)<>(SELECT count(DISTINCT d) FROM unnest(dates) d) OR NOT dates <@ tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select valid dates from this request'); END IF;
 previous:=COALESCE(current_setting('app.tbs_actor_label',true),'');
 PERFORM set_config('app.tbs_actor_label',tbs_self_record_label(uid),true);
 result:=tbs_cancel_dates(r,dates);
 PERFORM set_config('app.tbs_actor_label',previous,true);
 IF COALESCE((result->>'ok')::boolean,false) THEN
  INSERT INTO tbs_change_history(entity,record_id,user_id,action,actor,before_value,after_value)
  VALUES('employee_cancellation',r.id::text,uid,'cancel',tbs_self_record_label(uid),NULL,jsonb_build_object('dates',dates,'selfRecorded',true));
 END IF;
 RETURN result||jsonb_build_object('selfRecorded',true);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid cancellation values');
END $$;
CREATE OR REPLACE FUNCTION tbs_employee_request(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'userId'); kind text; dates date[]; per numeric; d date; r jsonb; ids integer[]:='{}'; msg text; code text; previous text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tbs_self_recorded_leave s JOIN tbs_employees e ON e.user_id=s.user_id WHERE s.user_id=uid AND COALESCE(e.status,'active')='active') THEN
  RETURN tbs_employee_request_before_self_record(payload);
 END IF;
 kind:=CASE WHEN payload->>'leaveType'='vacation' THEN 'annual' ELSE payload->>'leaveType' END;
 IF kind NOT IN ('sick','annual','personal') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose sick, annual or personal leave.'); END IF;
 SELECT array_agg(DISTINCT value::date ORDER BY value::date) INTO dates FROM jsonb_array_elements_text(COALESCE(payload->'selectedDates','[]'));
 IF cardinality(dates) IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select leave dates.'); END IF;
 IF dates[1]<make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int-1,1,1) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Leave can only be recorded from January last year.'); END IF;
 per:=round(((payload->>'leaveDays')::numeric/cardinality(dates))*4)/4;
 IF per NOT IN (0.5,1) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check your leave dates and duration.'); END IF;
 previous:=COALESCE(current_setting('app.tbs_actor_label',true),'');
 PERFORM set_config('app.tbs_actor_label',tbs_self_record_label(uid),true);
 BEGIN
  FOREACH d IN ARRAY dates LOOP
   r:=tbs_dashboard_request_v2('create',jsonb_build_object('userId',uid,'leaveDate',d,'leaveType',kind,'leaveDays',per,
    'halfDayPeriod',CASE WHEN per=0.5 THEN payload->'halfDayPeriod' ELSE 'null'::jsonb END,'reason',COALESCE(payload->>'reason',''),'status','Approved','source','line-self'));
   IF NOT COALESCE((r->>'ok')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='P2098',MESSAGE=COALESCE(r->>'error','Leave could not be recorded.'),DETAIL=COALESCE(r->>'statusCode','422');
   END IF;
   ids:=ids||(r->>'id')::integer;
  END LOOP;
 EXCEPTION WHEN SQLSTATE 'P2098' THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT, code=PG_EXCEPTION_DETAIL;
  PERFORM set_config('app.tbs_actor_label',previous,true);
  RETURN jsonb_build_object('ok',false,'statusCode',CASE WHEN code ~ '^[0-9]{3}$' THEN code::integer ELSE 422 END,'error',msg);
 END;
 PERFORM set_config('app.tbs_actor_label',previous,true);
 RETURN jsonb_build_object('ok',true,'id',ids[1],'ids',to_jsonb(ids),'status','Approved','selfRecorded',true);
END $$;
COMMIT;
