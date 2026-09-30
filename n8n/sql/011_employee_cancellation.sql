-- Apply through n8n PostgreSQL. No existing leave is modified.
BEGIN;
CREATE TABLE IF NOT EXISTS tbs_cancellation_requests (
 id bigserial PRIMARY KEY, request_id integer NOT NULL REFERENCES leave_requests(id),
 user_id text NOT NULL REFERENCES tbs_employees(user_id), account_user_id text NOT NULL,
 dates date[] NOT NULL, request_revision text NOT NULL, reason text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected','Expired')),
 decision_reason text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tbs_one_pending_cancellation ON tbs_cancellation_requests(request_id) WHERE status='Pending';

-- Any intervening leave edit invalidates the cancellation snapshot, including old LINE decisions.
CREATE OR REPLACE FUNCTION tbs_expire_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
 UPDATE tbs_cancellation_requests SET status='Expired',decided_at=now(),decision_reason='Leave changed; submit a new cancellation request.' WHERE request_id=NEW.id AND status='Pending';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_expire_cancellation ON leave_requests;
CREATE TRIGGER tbs_expire_cancellation AFTER UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_expire_cancellation();

CREATE OR REPLACE FUNCTION tbs_cancel_dates(r leave_requests, dates date[]) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE remaining date[]; all_dates date[]; result jsonb;
BEGIN
 all_dates:=tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date);
 SELECT COALESCE(array_agg(d ORDER BY d),ARRAY[]::date[]) INTO remaining FROM unnest(all_dates) d WHERE NOT(d=ANY(dates));
 IF cardinality(remaining)=0 THEN
 RETURN tbs_dashboard_request_v2('delete',jsonb_build_object('id',r.id,'scope','request','expectedDates',all_dates,'expectedRevision',md5(to_jsonb(r)::text)));
 END IF;
 result:=tbs_dashboard_request_v2('update',jsonb_build_object('id',r.id,'scope','request','expectedDates',all_dates,'expectedRevision',md5(to_jsonb(r)::text),
 'leaveDates',remaining,'leaveType',r.leave_type,'leaveDays',r.leave_days/cardinality(all_dates)*cardinality(remaining),
 'halfDayPeriod',r.half_day_period,'reason',r.reason,'status',r.status));
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
 'cancellation',(SELECT to_jsonb(x)-'account_user_id'-'request_revision'-'user_id' FROM tbs_cancellation_requests x WHERE x.request_id=l.id ORDER BY x.id DESC LIMIT 1)) ORDER BY l.id DESC)
 FROM leave_requests l WHERE l.user_id=uid AND l.status IN ('Pending','Approved')), '[]'::jsonb));
 ELSIF operation='admin-list' THEN
 RETURN jsonb_build_object('ok',true,'requests',COALESCE((SELECT jsonb_agg(to_jsonb(c)-'account_user_id' || jsonb_build_object('name',concat_ws(' ',e.first_name,e.last_name),'code',e.tbs_id,'type',l.leave_type,'period',l.half_day_period,'daysPerDate',l.leave_days/cardinality(tbs_request_dates(l.selected_dates,l.start_date::date,l.end_date::date))) ORDER BY c.id)
 FROM tbs_cancellation_requests c JOIN tbs_employees e ON e.user_id=c.user_id JOIN leave_requests l ON l.id=c.request_id WHERE c.status='Pending'),'[]'::jsonb));
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
 IF r.status='Pending' THEN
 result:=tbs_cancel_dates(r,dates);
 IF result->>'ok'='true' THEN
 INSERT INTO tbs_change_history(entity,record_id,user_id,action,actor,before_value,after_value)
 VALUES('employee_cancellation',r.id::text,uid,'cancel','Verified LINE employee',NULL,jsonb_build_object('dates',dates,'accountId',payload->>'accountId'));
 END IF;
 RETURN result;
 END IF;
 IF dates[1] <= (now() AT TIME ZONE 'Asia/Bangkok')::date THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Ask your boss to cancel leave for today or earlier.'); END IF;
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
 INSERT INTO tbs_change_history(entity,record_id,user_id,action,actor,before_value,after_value)
 VALUES('employee_cancellation',c.request_id::text,c.user_id,CASE WHEN operation='request' THEN 'request cancellation' ELSE operation||' cancellation' END,
 CASE WHEN operation='request' THEN 'Verified LINE employee' ELSE 'Dashboard — user not identified' END,NULL,to_jsonb(c));
 RETURN jsonb_build_object('ok',true,'id',c.id,'status',c.status);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid cancellation values');
END $$;
COMMIT;
