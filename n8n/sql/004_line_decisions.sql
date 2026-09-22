-- Apply through an n8n PostgreSQL node after the current 002 migration.
-- A single pending-state decision is shared with the dashboard.
BEGIN;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS decision_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE OR REPLACE FUNCTION tbs_line_decision(operation text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE request leave_requests%ROWTYPE; result jsonb; previous_channel text;
BEGIN
  IF operation NOT IN ('approve','reject') OR operation IS NULL
    OR COALESCE(payload->>'id','') !~ '^[1-9][0-9]*$' THEN
    RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid decision or request id');
  END IF;
  PERFORM 1 FROM tbs_employees WHERE user_id=(SELECT user_id FROM leave_requests WHERE id=(payload->>'id')::int) FOR UPDATE;
  SELECT * INTO request FROM leave_requests WHERE id=(payload->>'id')::int FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Request not found'); END IF;
  IF request.user_id IS DISTINCT FROM payload->>'userId' THEN
    RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Request identity changed. Refresh the request.');
  END IF;
  IF payload->>'decisionToken' IS DISTINCT FROM request.decision_token::text THEN
    RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This LINE message has expired. Review the current request in the dashboard.');
  END IF;
  previous_channel := COALESCE(current_setting('app.tbs_channel',true),'');
  PERFORM set_config('app.tbs_channel','line',true);
  result := tbs_dashboard_request_v2(operation,payload);
  PERFORM set_config('app.tbs_channel',previous_channel,true);
  RETURN result || jsonb_build_object('reason',request.reason,'user_name',request.user_name,
    'leave_type',request.leave_type,'leave_days',request.leave_days,'half_day_period',request.half_day_period,
    'selected_dates',array_to_string(tbs_request_dates(request.selected_dates,request.start_date::date,request.end_date::date),','),
    'f_start',to_char(request.start_date,'DD-Mon-YY'),'f_end',to_char(request.end_date,'DD-Mon-YY'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid request id');
END;
$$;
COMMIT;
