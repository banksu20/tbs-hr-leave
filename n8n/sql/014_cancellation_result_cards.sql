-- Apply through n8n PostgreSQL after 011, 012 and 013. No historical messages are replayed.
BEGIN;
CREATE OR REPLACE FUNCTION tbs_cancellation_result_flex(r jsonb, event text, dates date[], note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE card jsonb; title text; detail text; remaining date[]; days numeric; approved boolean;
BEGIN
 SELECT COALESCE(array_agg(d ORDER BY d),ARRAY[]::date[]) INTO remaining
 FROM unnest(tbs_request_dates(r->>'selected_dates',(r->>'start_date')::date,(r->>'end_date')::date)) d WHERE NOT(d=ANY(dates));
 days:=(r->>'leave_days')::numeric/cardinality(tbs_request_dates(r->>'selected_dates',(r->>'start_date')::date,(r->>'end_date')::date))*cardinality(dates);
 days:=trim_scale(days);
 title:=CASE event WHEN 'request' THEN 'รออนุมัติยกเลิก / Cancellation requested'
 WHEN 'reject' THEN 'ไม่อนุมัติการยกเลิก / Cancellation declined'
 WHEN 'expired' THEN 'คำขอยกเลิกหมดอายุ / Cancellation expired'
 WHEN 'cancel' THEN 'ยกเลิกคำขอแล้ว / Request cancelled'
 ELSE CASE WHEN cardinality(remaining)>0 THEN 'ยกเลิกบางวันแล้ว / Partial cancellation approved' ELSE 'ยกเลิกวันลาแล้ว / Cancellation approved' END END;
 detail:=CASE event WHEN 'request' THEN 'Leave and balance stay unchanged until your boss approves. / วันลาและยอดคงเหลือยังไม่เปลี่ยน'
 WHEN 'reject' THEN 'Your original leave remains approved. / วันลาเดิมยังอนุมัติอยู่'
 WHEN 'expired' THEN 'Leave details changed. Review your history before requesting again. / รายละเอียดวันลาเปลี่ยน กรุณาตรวจสอบประวัติ'
 WHEN 'cancel' THEN 'The selected pending dates were cancelled. No boss approval was needed. / ยกเลิกวันที่เลือกแล้ว ไม่ต้องรอหัวหน้า'
 ELSE days||' day(s) restored / คืนสิทธิ์วันลา'||CASE WHEN cardinality(remaining)>0 THEN '. Still approved / วันที่ยังอนุมัติ: '||tbs_card_dates(remaining) ELSE '. All dates in this request were cancelled. / ยกเลิกครบทุกวันในคำขอนี้' END END;
 approved:=event IN ('approve','cancel');
 card:=tbs_leave_result_flex(r||jsonb_build_object('status',CASE WHEN approved THEN 'Approved' ELSE 'Rejected' END,'selected_dates',array_to_string(dates,','),'leave_days',days,'rejection_reason',NULL));
 card:=jsonb_set(card,'{altText}',to_jsonb(left(title||' · #'||(r->>'id'),400)));
 card:=jsonb_set(card,'{contents,body,contents,0,text}',to_jsonb(title));
 IF event='request' THEN
 card:=jsonb_set(card,'{contents,body,contents,0,color}','"#B7791F"');
 card:=jsonb_set(card,'{contents,body,contents,4,backgroundColor}','"#FFFBEB"');
 card:=jsonb_set(card,'{contents,body,contents,4,contents,1,color}','"#B7791F"');
 END IF;
 card:=jsonb_set(card,'{contents,body,contents,2,text}',to_jsonb('Cancellation / การยกเลิก · #'||(r->>'id')));
 card:=jsonb_set(card,'{contents,body,contents}',(card#>'{contents,body,contents}')||jsonb_build_array(jsonb_build_object('type','text','text',left(detail,2000),'wrap',true,'size','sm','color','#475569')));
 IF NULLIF(btrim(note),'') IS NOT NULL THEN
 card:=jsonb_set(card,'{contents,body,contents}',(card#>'{contents,body,contents}')||jsonb_build_array(jsonb_build_object('type','text','text','เหตุผล / Note: '||left(note,1000),'wrap',true,'size','sm','color','#475569')));
 END IF;
 RETURN card;
END $$;
CREATE OR REPLACE FUNCTION tbs_queue_cancellation_result(r jsonb, account text, event text, dates date[], note text DEFAULT '') RETURNS void LANGUAGE sql AS $$
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',r->>'user_id',jsonb_build_object('to',account,'messages',jsonb_build_array(tbs_cancellation_result_flex(r,event,dates,note))));
$$;
CREATE OR REPLACE FUNCTION tbs_queue_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; years integer[]; y integer; r jsonb;
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'updated_at')=(to_jsonb(NEW)-'updated_at') THEN RETURN NEW; END IF;
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='leave_requests' THEN
   IF TG_OP<>'INSERT' THEN
     FOR d IN SELECT unnest(tbs_request_dates(OLD.selected_dates,OLD.start_date::date,OLD.end_date::date)) LOOP
       years:=array_append(years,extract(year FROM d)::int);
     END LOOP;
   END IF;
   IF TG_OP<>'DELETE' THEN
     FOR d IN SELECT unnest(tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date)) LOOP
       years:=array_append(years,extract(year FROM d)::int);
     END LOOP;
   END IF;
   IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Approved','Rejected') AND COALESCE(current_setting('tbs.cancellation_change',true),'')<>'yes' THEN
     INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',NEW.user_id,
       jsonb_build_object('to',COALESCE((SELECT account_user_id FROM tbs_request_accounts WHERE request_id=NEW.id),NEW.user_id),
       'messages',jsonb_build_array(tbs_leave_result_flex(to_jsonb(NEW)||jsonb_build_object('decision_kind',current_setting('app.tbs_action',true))))));
   END IF;
 ELSIF TG_TABLE_NAME='leave_quotas' THEN years:=ARRAY[(r->>'year')::int];
 ELSE SELECT array_agg(DISTINCT year) INTO years FROM leave_quotas WHERE user_id=r->>'user_id';
 END IF;
 FOR y IN SELECT DISTINCT unnest(years) LOOP PERFORM tbs_queue_sheet(r->>'user_id',y); END LOOP;
 RETURN COALESCE(NEW,OLD);
END;
$$;

CREATE OR REPLACE FUNCTION tbs_cancel_dates(r leave_requests, dates date[]) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE remaining date[]; all_dates date[]; result jsonb; previous text;
BEGIN
 previous:=current_setting('tbs.cancellation_change',true);
 PERFORM set_config('tbs.cancellation_change','yes',true);
 all_dates:=tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date);
 SELECT COALESCE(array_agg(d ORDER BY d),ARRAY[]::date[]) INTO remaining FROM unnest(all_dates) d WHERE NOT(d=ANY(dates));
 IF cardinality(remaining)=0 THEN
 result:=tbs_dashboard_request_v2('delete',jsonb_build_object('id',r.id,'scope','request','expectedDates',all_dates,'expectedRevision',md5(to_jsonb(r)::text)));
 ELSE
 result:=tbs_dashboard_request_v2('update',jsonb_build_object('id',r.id,'scope','request','expectedDates',all_dates,'expectedRevision',md5(to_jsonb(r)::text),
 'leaveDates',remaining,'leaveType',r.leave_type,'leaveDays',r.leave_days/cardinality(all_dates)*cardinality(remaining),
 'halfDayPeriod',r.half_day_period,'reason',r.reason,'status',r.status));
 END IF;
 PERFORM set_config('tbs.cancellation_change',COALESCE(previous,''),true);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text; r leave_requests%ROWTYPE; c tbs_cancellation_requests%ROWTYPE; dates date[]; result jsonb; previous_channel text;
BEGIN
 IF operation='employee-list' THEN
 uid:=tbs_resolve_employee(payload->>'accountId');
 RETURN jsonb_build_object('ok',true,'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object(
 'id',l.id,'status',l.status,'type',l.leave_type,'days',l.leave_days,'period',l.half_day_period,
 'dates',tbs_request_dates(l.selected_dates,l.start_date::date,l.end_date::date),'revision',md5(to_jsonb(l)::text),
 'cancellation',(SELECT to_jsonb(x)-'account_user_id'-'request_revision'-'user_id' FROM tbs_cancellation_requests x WHERE x.request_id=l.id ORDER BY x.id DESC LIMIT 1)) ORDER BY (SELECT max(d) FROM unnest(tbs_request_dates(l.selected_dates,l.start_date::date,l.end_date::date)) d) DESC,l.id DESC)
 FROM leave_requests l WHERE l.user_id=uid), '[]'::jsonb));
 ELSIF operation='admin-list' THEN
 RETURN jsonb_build_object('ok',true,'requests',COALESCE((SELECT jsonb_agg(to_jsonb(cr)-'account_user_id' || jsonb_build_object('name',concat_ws(' ',e.first_name,e.last_name),'code',e.tbs_id,'type',l.leave_type,'period',l.half_day_period,'daysPerDate',l.leave_days/cardinality(tbs_request_dates(l.selected_dates,l.start_date::date,l.end_date::date))) ORDER BY cr.id)
 FROM tbs_cancellation_requests cr JOIN tbs_employees e ON e.user_id=cr.user_id JOIN leave_requests l ON l.id=cr.request_id WHERE cr.status='Pending'),'[]'::jsonb));
 END IF;
 IF operation NOT IN ('request','approve','reject') OR operation IS NULL OR COALESCE(payload->>'id','')!~'^[1-9][0-9]*$' THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid cancellation action'); END IF;
 IF operation='request' THEN
 uid:=tbs_resolve_employee(payload->>'accountId');
 PERFORM 1 FROM tbs_employees WHERE user_id=uid AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Active employee not found'); END IF;
 SELECT * INTO r FROM leave_requests WHERE id=(payload->>'id')::int AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Leave request not found'); END IF;
 IF payload->>'revision' IS DISTINCT FROM md5(to_jsonb(r)::text) OR r.status NOT IN ('Pending','Approved') THEN
 RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Leave changed. Refresh and try again.'); END IF;
 IF jsonb_typeof(payload->'dates') IS DISTINCT FROM 'array' OR length(COALESCE(payload->>'reason',''))>1000 THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select dates and use a reason under 1000 characters'); END IF;
 SELECT array_agg(value::date ORDER BY value::date) INTO dates FROM jsonb_array_elements_text(payload->'dates');
 IF COALESCE(cardinality(dates),0)=0 OR cardinality(dates)<>(SELECT count(DISTINCT d) FROM unnest(dates)d) OR array_position(dates,NULL) IS NOT NULL OR NOT dates <@ tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Select valid dates from this request'); END IF;
 IF dates[1] < (now() AT TIME ZONE 'Asia/Bangkok')::date OR (r.status='Approved' AND dates[1] <= (now() AT TIME ZONE 'Asia/Bangkok')::date) THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Past leave cannot be cancelled here. Approved leave must be in the future.'); END IF;
 IF r.id IS DISTINCT FROM (SELECT latest.id FROM leave_requests latest WHERE latest.user_id=uid AND latest.status IN ('Pending','Approved')
 AND EXISTS(SELECT 1 FROM unnest(tbs_request_dates(latest.selected_dates,latest.start_date::date,latest.end_date::date)) d
 WHERE d >= (now() AT TIME ZONE 'Asia/Bangkok')::date AND (latest.status='Pending' OR d > (now() AT TIME ZONE 'Asia/Bangkok')::date))
 ORDER BY (SELECT max(d) FROM unnest(tbs_request_dates(latest.selected_dates,latest.start_date::date,latest.end_date::date)) d) DESC,latest.id DESC LIMIT 1) THEN
 RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Only your latest eligible leave entry can be cancelled. Refresh your history.'); END IF;
 IF r.status='Pending' THEN
 result:=tbs_cancel_dates(r,dates);
 IF result->>'ok'='true' THEN
 PERFORM tbs_queue_cancellation_result(to_jsonb(r),payload->>'accountId','cancel',dates);
 INSERT INTO tbs_change_history(entity,record_id,user_id,action,actor,before_value,after_value)
 VALUES('employee_cancellation',r.id::text,uid,'cancel','Verified LINE employee',NULL,jsonb_build_object('dates',dates,'accountId',payload->>'accountId'));
 END IF;
 RETURN result;
 END IF;
 IF EXISTS(SELECT 1 FROM tbs_cancellation_requests WHERE request_id=r.id AND status='Pending') THEN
 RETURN jsonb_build_object('ok',false,'statusCode',409,'error','A cancellation is already waiting for your boss.'); END IF;
 INSERT INTO tbs_cancellation_requests(request_id,user_id,account_user_id,dates,request_revision,reason)
 VALUES(r.id,uid,payload->>'accountId',dates,md5(to_jsonb(r)::text),COALESCE(payload->>'reason','')) RETURNING * INTO c;
 ELSE
 -- All paths lock employee, leave, cancellation in the same order.
 SELECT * INTO c FROM tbs_cancellation_requests WHERE id=(payload->>'id')::bigint;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Cancellation not found'); END IF;
 PERFORM 1 FROM tbs_employees WHERE user_id=c.user_id FOR UPDATE;
 SELECT * INTO r FROM leave_requests WHERE id=c.request_id FOR UPDATE;
 SELECT * INTO c FROM tbs_cancellation_requests WHERE id=c.id FOR UPDATE;
 IF c.status<>'Pending' OR r.status<>'Approved' OR c.request_revision IS DISTINCT FROM md5(to_jsonb(r)::text) THEN
 RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Cancellation or leave changed. Refresh before deciding.'); END IF;
 IF length(COALESCE(payload->>'reason',''))>1000 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Reason is too long'); END IF;
 UPDATE tbs_cancellation_requests SET status=CASE WHEN operation='approve' THEN 'Approved' ELSE 'Rejected' END,decision_reason=COALESCE(payload->>'reason',''),decided_at=now() WHERE id=c.id RETURNING * INTO c;
 IF operation='approve' THEN
 result:=tbs_cancel_dates(r,c.dates);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '%',result->>'error'; END IF;
 END IF;
 END IF;
 PERFORM tbs_queue_cancellation_result(to_jsonb(r),c.account_user_id,operation,c.dates,CASE WHEN operation='request' THEN c.reason ELSE c.decision_reason END);
 INSERT INTO tbs_change_history(entity,record_id,user_id,action,actor,before_value,after_value)
 VALUES('employee_cancellation',c.request_id::text,c.user_id,CASE WHEN operation='request' THEN 'request cancellation' ELSE operation||' cancellation' END,
 CASE WHEN operation='request' THEN 'Verified LINE employee' ELSE 'Dashboard — user not identified' END,NULL,to_jsonb(c));
 RETURN jsonb_build_object('ok',true,'id',c.id,'status',c.status);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid cancellation values');
END $$;
COMMIT;
