-- Apply through n8n PostgreSQL after migrations 001–008.
BEGIN;
CREATE TABLE IF NOT EXISTS tbs_employee_accounts (
 account_user_id text PRIMARY KEY REFERENCES tbs_employees(user_id),
 employee_user_id text NOT NULL REFERENCES tbs_employees(user_id),
 linked_at timestamptz NOT NULL DEFAULT now(),
 CHECK(account_user_id<>employee_user_id)
);
CREATE TABLE IF NOT EXISTS tbs_request_accounts (
 request_id integer PRIMARY KEY REFERENCES leave_requests(id),
 account_user_id text NOT NULL
);
CREATE TABLE IF NOT EXISTS tbs_account_merge_archive (
 merge_key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), snapshot jsonb NOT NULL
);
CREATE OR REPLACE FUNCTION tbs_resolve_employee(account_id text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT employee_user_id FROM tbs_employee_accounts WHERE account_user_id=account_id),account_id);
$$;
CREATE OR REPLACE FUNCTION tbs_validate_account_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM tbs_employee_accounts WHERE account_user_id=NEW.employee_user_id OR employee_user_id=NEW.account_user_id)
 THEN RAISE EXCEPTION 'Account links must point directly to the main employee'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tbs_account_link_guard ON tbs_employee_accounts;
CREATE TRIGGER tbs_account_link_guard BEFORE INSERT OR UPDATE ON tbs_employee_accounts FOR EACH ROW EXECUTE FUNCTION tbs_validate_account_link();
CREATE OR REPLACE FUNCTION tbs_protect_linked_employee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM tbs_employee_accounts WHERE account_user_id=NEW.user_id) THEN
  RAISE EXCEPTION 'This account is linked to another employee. Refresh and edit the main employee instead.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
-- Prevent old dashboard tabs/registration paths from reactivating or changing the archived identity.
DROP TRIGGER IF EXISTS tbs_linked_employee_guard ON tbs_employees;
CREATE TRIGGER tbs_linked_employee_guard BEFORE UPDATE ON tbs_employees FOR EACH ROW EXECUTE FUNCTION tbs_protect_linked_employee();
DROP TRIGGER IF EXISTS tbs_linked_quota_guard ON leave_quotas;
CREATE TRIGGER tbs_linked_quota_guard BEFORE INSERT OR UPDATE ON leave_quotas FOR EACH ROW EXECUTE FUNCTION tbs_protect_linked_employee();
DROP TRIGGER IF EXISTS tbs_linked_leave_guard ON leave_requests;
CREATE TRIGGER tbs_linked_leave_guard BEFORE INSERT OR UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_protect_linked_employee();
CREATE OR REPLACE FUNCTION tbs_employee_request(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; dates date[]; employee tbs_employees%ROWTYPE; request leave_requests%ROWTYPE; amount numeric; period text; kind text;
BEGIN
 SELECT * INTO employee FROM tbs_employees WHERE user_id=tbs_resolve_employee(payload->>'userId') AND COALESCE(status,'active')='active' FOR UPDATE;
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
 IF tbs_resolve_employee(COALESCE(payload->>'submittedBy',payload->>'userId')) IS DISTINCT FROM employee.user_id THEN
  RAISE EXCEPTION 'Submitting account does not belong to employee' USING ERRCODE='23514';
 END IF;
 INSERT INTO tbs_request_accounts(request_id,account_user_id)
 VALUES(request.id,COALESCE(payload->>'submittedBy',payload->>'userId'));
 INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',employee.user_id,tbs_approval_message(request,payload->'approverIds'));
 RETURN to_jsonb(request)||jsonb_build_object('ok',true,'revision',md5(to_jsonb(request)::text));
EXCEPTION WHEN exclusion_violation THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Overlapping leave exists. Review existing requests.');
WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request');
END;
$$;
CREATE OR REPLACE FUNCTION tbs_queue_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; years integer[]; y integer; r jsonb; dates text; text_message text;
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
   IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Approved','Rejected') THEN
     dates:=array_to_string(tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date),', ');
     text_message:=format('Leave request #%s: %s / %s%sDates: %s%sType: %s · %s day(s)%s%s',NEW.id,
       NEW.status,CASE WHEN NEW.status='Approved' THEN 'อนุมัติแล้ว' ELSE 'ไม่อนุมัติ/ยกเลิก' END,chr(10),dates,chr(10),
       NEW.leave_type,NEW.leave_days,CASE WHEN NEW.half_day_period IS NULL THEN '' ELSE ' · '||NEW.half_day_period END,
       CASE WHEN NEW.rejection_reason IS NULL THEN '' ELSE chr(10)||'Reason: '||NEW.rejection_reason END);
     INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',NEW.user_id,jsonb_build_object('to',COALESCE((SELECT account_user_id FROM tbs_request_accounts WHERE request_id=NEW.id),NEW.user_id),'messages',jsonb_build_array(jsonb_build_object('type','text','text',text_message))));
   END IF;
 ELSIF TG_TABLE_NAME='leave_quotas' THEN years:=ARRAY[(r->>'year')::int];
 ELSE SELECT array_agg(DISTINCT year) INTO years FROM leave_quotas WHERE user_id=r->>'user_id';
 END IF;
 FOR y IN SELECT DISTINCT unnest(years) LOOP PERFORM tbs_queue_sheet(r->>'user_id',y); END LOOP;
 RETURN COALESCE(NEW,OLD);
END;
$$;

COMMIT;
