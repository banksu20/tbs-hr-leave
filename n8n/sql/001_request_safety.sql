-- Additive migration for the existing n8n database. No leave records are changed.
-- Do NOT run postgres_schema.sql: that legacy seed truncates tables.
BEGIN;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS half_day_period text;

CREATE OR REPLACE FUNCTION tbs_request_dates(selected text, first_day date, last_day date)
RETURNS date[] LANGUAGE sql IMMUTABLE AS $$
  WITH explicit_dates AS (
    SELECT DISTINCT match[1]::date AS day
    FROM regexp_matches(COALESCE(selected, ''), '(\d{4}-\d{2}-\d{2})', 'g') AS match
  ), all_dates AS (
    SELECT day FROM explicit_dates
    UNION ALL
    SELECT first_day + offset_days
    FROM generate_series(0, GREATEST(COALESCE(last_day, first_day) - first_day, 0)) AS offset_days
    WHERE NOT EXISTS (SELECT 1 FROM explicit_dates)
  )
  SELECT COALESCE(array_agg(day ORDER BY day), ARRAY[]::date[]) FROM all_dates;
$$;

CREATE OR REPLACE FUNCTION tbs_dashboard_request(operation text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  target_id integer;
  old_row leave_requests%ROWTYPE;
  days date[];
  expected date[];
  amount numeric;
  period text;
  saved_id integer;
BEGIN
  IF operation NOT IN ('create', 'update', 'delete') THEN
    RETURN jsonb_build_object('ok', false, 'statusCode', 422, 'error', 'Invalid operation');
  END IF;
  IF operation != 'create' THEN
    IF payload->>'scope' IS DISTINCT FROM 'request' OR COALESCE(payload->>'id', '') !~ '^[1-9][0-9]*$'
       OR jsonb_typeof(payload->'expectedDates') IS DISTINCT FROM 'array' THEN
      RETURN jsonb_build_object('ok', false, 'statusCode', 422, 'error', 'Explicit request scope, id and expectedDates are required');
    END IF;
    target_id := (payload->>'id')::integer;
    SELECT * INTO old_row FROM leave_requests WHERE id = target_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'statusCode', 404, 'error', 'Leave request not found');
    END IF;
    SELECT array_agg(value::date ORDER BY value::date) INTO expected FROM jsonb_array_elements_text(payload->'expectedDates');
    IF expected IS NULL OR expected IS DISTINCT FROM tbs_request_dates(old_row.selected_dates::text, old_row.start_date::date, old_row.end_date::date) THEN
      RETURN jsonb_build_object('ok', false, 'statusCode', 409, 'error', 'Request dates changed; refresh before saving');
    END IF;
    IF operation = 'delete' THEN
      UPDATE leave_requests SET status = 'Rejected' WHERE id = target_id;
      RETURN jsonb_build_object('ok', true, 'id', target_id);
    END IF;
  END IF;

  IF operation = 'create' THEN
    days := ARRAY[(payload->>'leaveDate')::date];
  ELSE
    IF jsonb_typeof(payload->'leaveDates') IS DISTINCT FROM 'array' THEN
      RETURN jsonb_build_object('ok', false, 'statusCode', 422, 'error', 'All request dates are required');
    END IF;
    SELECT array_agg(value::date ORDER BY value::date) INTO days FROM jsonb_array_elements_text(payload->'leaveDates');
  END IF;
  IF days IS NULL OR cardinality(days) NOT BETWEEN 1 AND 366 OR array_position(days, NULL) IS NOT NULL
     OR cardinality(days) != (SELECT count(DISTINCT d) FROM unnest(days) d) THEN
    RETURN jsonb_build_object('ok', false, 'statusCode', 422, 'error', 'Invalid or duplicate request dates');
  END IF;
  amount := (payload->>'leaveDays')::numeric;
  period := payload->>'halfDayPeriod';
  IF amount IS NULL OR amount / cardinality(days) NOT IN (0.25, 0.5, 1)
     OR payload->>'leaveType' IS NULL OR payload->>'leaveType' NOT IN ('annual', 'sick', 'personal')
     OR payload->>'status' IS NULL OR payload->>'status' NOT IN ('Approved', 'Pending', 'Rejected') THEN
    RETURN jsonb_build_object('ok', false, 'statusCode', 422, 'error', 'Invalid leave type, duration or status');
  END IF;
  IF (amount / cardinality(days) = 0.5 AND (period IS NULL OR period NOT IN ('morning', 'afternoon')))
     OR (amount / cardinality(days) != 0.5 AND period IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'statusCode', 422, 'error', 'Choose morning or afternoon for half-day leave only');
  END IF;

  IF operation = 'create' THEN
    INSERT INTO leave_requests (user_id, user_name, department, leave_type, leave_days, start_date, end_date, selected_dates, reason, status, source, half_day_period)
    SELECT e.user_id, concat_ws(' ', e.first_name, e.last_name), e.department,
      payload->>'leaveType', amount, days[1], days[cardinality(days)], array_to_string(days, ','),
      COALESCE(payload->>'reason', ''), payload->>'status', 'dashboard', period
    FROM tbs_employees e WHERE e.user_id = payload->>'userId' AND COALESCE(e.status, 'active') = 'active'
    RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'statusCode', 404, 'error', 'Active employee not found');
    END IF;
  ELSE
    UPDATE leave_requests SET leave_type = payload->>'leaveType', leave_days = amount,
      start_date = days[1], end_date = days[cardinality(days)], selected_dates = array_to_string(days, ','),
      reason = COALESCE(payload->>'reason', ''), status = payload->>'status', half_day_period = period
    WHERE id = target_id RETURNING id INTO saved_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', saved_id);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok', false, 'statusCode', 422, 'error', 'Invalid date, id or numeric value');
END;
$$;
COMMIT;
