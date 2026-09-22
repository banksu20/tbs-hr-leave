-- Apply after 001_request_safety.sql through an n8n PostgreSQL node.
-- Records future changes only; never fabricates historical events or identities.
BEGIN;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS rejection_reason text;
CREATE TABLE IF NOT EXISTS tbs_change_history (
  id bigserial PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  entity text NOT NULL,
  record_id text NOT NULL,
  user_id text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  before_value jsonb,
  after_value jsonb
);
CREATE INDEX IF NOT EXISTS tbs_history_user_id ON tbs_change_history(user_id, id DESC);

CREATE OR REPLACE FUNCTION tbs_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b jsonb; a jsonb; r jsonb; context text;
BEGIN
  IF TG_OP <> 'INSERT' THEN b := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN a := to_jsonb(NEW); END IF;
  -- Timestamp-only quota saves are not meaningful changes.
  IF TG_OP = 'UPDATE' AND (b - 'updated_at') = (a - 'updated_at') THEN RETURN NEW; END IF;
  r := COALESCE(a,b);
  context := current_setting('app.tbs_action', true);
  INSERT INTO tbs_change_history(entity,record_id,user_id,action,actor,before_value,after_value)
  VALUES (TG_TABLE_NAME,
    CASE WHEN TG_TABLE_NAME='leave_requests' THEN r->>'id'
      WHEN TG_TABLE_NAME='leave_quotas' THEN (r->>'user_id') || ':' || (r->>'year') ELSE r->>'user_id' END,
    r->>'user_id',
    CASE WHEN TG_TABLE_NAME='leave_requests' AND context IN ('cancel','restore','approve','reject') THEN context ELSE lower(TG_OP) END,
    CASE WHEN current_setting('app.tbs_channel',true)='line' THEN 'LINE — user not identified' WHEN COALESCE(context,'') <> '' THEN 'Dashboard — user not identified' ELSE 'Database change — user not identified' END,
    b,a);
  RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS tbs_audit_leave ON leave_requests;
CREATE TRIGGER tbs_audit_leave AFTER INSERT OR UPDATE OR DELETE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_capture_change();
DROP TRIGGER IF EXISTS tbs_audit_quota ON leave_quotas;
CREATE TRIGGER tbs_audit_quota AFTER INSERT OR UPDATE OR DELETE ON leave_quotas FOR EACH ROW EXECUTE FUNCTION tbs_capture_change();
DROP TRIGGER IF EXISTS tbs_audit_employee ON tbs_employees;
CREATE TRIGGER tbs_audit_employee AFTER INSERT OR UPDATE OR DELETE ON tbs_employees FOR EACH ROW EXECUTE FUNCTION tbs_capture_change();

CREATE OR REPLACE FUNCTION tbs_check_leave_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dates date[];
BEGIN
  IF NEW.status='Rejected' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.user_id,NEW.status,NEW.selected_dates,NEW.start_date,NEW.end_date,NEW.leave_days,NEW.half_day_period)
    IS NOT DISTINCT FROM ROW(OLD.user_id,OLD.status,OLD.selected_dates,OLD.start_date,OLD.end_date,OLD.leave_days,OLD.half_day_period) THEN RETURN NEW; END IF;
  -- Serialize writes for this employee, including writes outside the dashboard.
  PERFORM 1 FROM tbs_employees WHERE user_id=NEW.user_id FOR UPDATE;
  dates := tbs_request_dates(NEW.selected_dates,NEW.start_date::date,NEW.end_date::date);
  IF EXISTS (
    SELECT 1 FROM leave_requests r
    WHERE r.user_id=NEW.user_id AND r.id IS DISTINCT FROM NEW.id AND COALESCE(r.status,'Pending') <> 'Rejected'
      AND tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) && dates
      AND NOT (NEW.leave_days / NULLIF(cardinality(dates),0)=0.5
        AND r.leave_days / NULLIF(cardinality(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date)),0)=0.5
        AND NEW.half_day_period IN ('morning','afternoon') AND r.half_day_period IN ('morning','afternoon')
        AND NEW.half_day_period <> r.half_day_period)
  ) THEN RAISE EXCEPTION 'Overlapping leave exists. Review the employee’s leave dates and periods before saving.' USING ERRCODE='23P01'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tbs_leave_overlap ON leave_requests;
CREATE TRIGGER tbs_leave_overlap BEFORE INSERT OR UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION tbs_check_leave_overlap();

CREATE OR REPLACE FUNCTION tbs_dashboard_request_v2(operation text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; current_row leave_requests%ROWTYPE; event tbs_change_history%ROWTYPE; previous_context text;
BEGIN
  previous_context := COALESCE(current_setting('app.tbs_action',true),'');
  PERFORM set_config('app.tbs_action', CASE WHEN operation='delete' THEN 'cancel' ELSE operation END,true);
  IF operation IN ('update','delete','restore','approve','reject') THEN
    IF COALESCE(payload->>'id','') !~ '^[1-9][0-9]*$' THEN
      result := jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request id');
    ELSE
      -- Same lock ordering as inserts: employee first, then request.
      PERFORM 1 FROM tbs_employees WHERE user_id=(SELECT user_id FROM leave_requests WHERE id=(payload->>'id')::int) FOR UPDATE;
      SELECT * INTO current_row FROM leave_requests WHERE id=(payload->>'id')::int FOR UPDATE;
      IF NOT FOUND THEN result := jsonb_build_object('ok',false,'statusCode',404,'error','Leave request not found');
      ELSIF operation IN ('update','delete') AND payload->>'expectedRevision' IS DISTINCT FROM md5(to_jsonb(current_row)::text) THEN
        result := jsonb_build_object('ok',false,'statusCode',409,'error','Request changed since you loaded it. Refresh and review before saving.');
      ELSIF operation='update' AND payload->>'status' IS DISTINCT FROM current_row.status THEN
        result := jsonb_build_object('ok',false,'statusCode',409,'error','Use Approve or Reject to decide a pending request.');
      ELSIF operation IN ('update','delete') AND current_row.status='Rejected' THEN
        result := jsonb_build_object('ok',false,'statusCode',409,'error','This request is cancelled. Use Undo cancellation.');
      END IF;
    END IF;
  END IF;
  IF result IS NULL AND operation IN ('approve','reject') THEN
    IF lower(current_row.status) NOT IN ('pending','awaiting','awaiting approval') OR current_row.status IS NULL THEN
      result := jsonb_build_object('ok',false,'statusCode',409,'error','This request is no longer awaiting approval. Refresh the dashboard.');
    ELSIF payload->>'expectedRevision' IS DISTINCT FROM md5(to_jsonb(current_row)::text) THEN
      result := jsonb_build_object('ok',false,'statusCode',409,'error','Request changed since you loaded it. Refresh and review before deciding.');
    ELSIF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=current_row.user_id AND status='active') THEN
      result := jsonb_build_object('ok',false,'statusCode',409,'error','Employee is inactive. Restore the employee before deciding.');
    ELSIF operation='reject' AND ((payload ? 'rejectionReason' AND jsonb_typeof(payload->'rejectionReason') IS DISTINCT FROM 'string') OR length(payload->>'rejectionReason')>1000) THEN
      result := jsonb_build_object('ok',false,'statusCode',422,'error','Rejection reason must be text, up to 1000 characters');
    ELSE
      UPDATE leave_requests SET rejection_reason=CASE WHEN operation='reject' THEN NULLIF(btrim(payload->>'rejectionReason'),'') ELSE rejection_reason END, status=CASE WHEN operation='approve' THEN 'Approved' ELSE 'Rejected' END WHERE id=current_row.id;
      result := jsonb_build_object('ok',true,'id',current_row.id);
    END IF;
  ELSIF result IS NULL AND operation='restore' THEN
    SELECT * INTO event FROM tbs_change_history WHERE entity='leave_requests' AND record_id=payload->>'id' ORDER BY id DESC LIMIT 1;
    IF event.id IS NULL OR event.action <> 'cancel' OR event.id::text IS DISTINCT FROM payload->>'cancellationId'
       OR event.after_value IS DISTINCT FROM to_jsonb(current_row) OR current_row.status <> 'Rejected'
       OR event.before_value->>'status' NOT IN ('Approved','Pending') THEN
      result := jsonb_build_object('ok',false,'statusCode',409,'error','Cancellation changed or cannot be restored. Refresh history.');
    ELSIF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=current_row.user_id AND status='active') THEN
      result := jsonb_build_object('ok',false,'statusCode',409,'error','Restore the employee to the active roster first.');
    ELSE
      UPDATE leave_requests SET status=event.before_value->>'status' WHERE id=current_row.id;
      result := jsonb_build_object('ok',true,'id',current_row.id);
    END IF;
  ELSIF result IS NULL THEN
    result := tbs_dashboard_request(operation,payload);
  END IF;
  PERFORM set_config('app.tbs_action',previous_context,true);
  RETURN result;
EXCEPTION WHEN exclusion_violation THEN
  RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Overlapping leave exists. Review the employee’s leave dates and periods before saving.');
WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request id');
END;
$$;
COMMIT;
