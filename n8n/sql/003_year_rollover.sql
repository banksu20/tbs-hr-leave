BEGIN;
ALTER TABLE leave_quotas ADD COLUMN IF NOT EXISTS carryover_expires_on date;
ALTER TABLE leave_quotas ADD COLUMN IF NOT EXISTS rollover_source_year integer;
ALTER TABLE leave_quotas ADD COLUMN IF NOT EXISTS rollover_source_unused numeric;

-- Keep consumed carryover in the effective allowance after expiry so those
-- days are not charged twice. Pending leave continues to reserve allowance.
CREATE OR REPLACE FUNCTION tbs_quota_usage(uid text, yr integer, as_of date DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date)
RETURNS TABLE(annual numeric,sick numeric,personal numeric,effective_carried numeric) LANGUAGE sql STABLE AS $$
  WITH daily AS (
    SELECT lower(r.leave_type) AS type, day,
      r.leave_days / NULLIF(cardinality(d.dates),0) AS amount
    FROM leave_requests r CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) AS dates) d
    CROSS JOIN LATERAL unnest(d.dates) day
    WHERE r.user_id=uid AND COALESCE(r.status,'Pending')<>'Rejected' AND extract(year FROM day)=yr
  ), totals AS (
    SELECT COALESCE(sum(amount) FILTER(WHERE type IN ('annual','vacation')),0) annual,
      COALESCE(sum(amount) FILTER(WHERE type='sick'),0) sick,
      COALESCE(sum(amount) FILTER(WHERE type='personal'),0) personal FROM daily
  )
  SELECT t.annual,t.sick,t.personal,
    CASE WHEN q.carryover_expires_on IS NOT NULL AND as_of>q.carryover_expires_on THEN
      LEAST(COALESCE(q.carried_over,0),COALESCE((SELECT sum(amount) FROM daily WHERE type IN ('annual','vacation') AND day<=q.carryover_expires_on),0))
    ELSE COALESCE(q.carried_over,0) END
  FROM totals t LEFT JOIN leave_quotas q ON q.user_id=uid AND q.year=yr;
$$;

CREATE OR REPLACE FUNCTION tbs_rollover_unused(uid text, yr integer) RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT GREATEST(q.annual_total-GREATEST(u.annual-u.effective_carried,0),0)
 FROM leave_quotas q CROSS JOIN LATERAL tbs_quota_usage(uid,yr,make_date(yr,12,31)) u
 WHERE q.user_id=uid AND q.year=yr AND q.annual_total IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION tbs_rollover(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE reconcile boolean; yr integer; fingerprint text; saved_count integer; field text; quota_value numeric; expiry date; rows jsonb; token text; override_row jsonb; employee_row jsonb; amount numeric; employee_expiry date;
BEGIN
  reconcile := COALESCE((payload->>'reconcile')::boolean,false);
  yr := (payload->>'sourceYear')::integer;
  expiry := (payload->>'expiresOn')::date;
  IF yr IS NULL OR yr NOT BETWEEN 2000 AND 2099
    OR expiry IS NULL OR extract(year FROM expiry)<>yr+1 OR payload->>'action' IS NULL OR payload->>'action' NOT IN ('preview','apply') THEN
    RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose a source year and expiry within the next year.');
  END IF;
  IF payload->>'action'='apply' THEN
    -- Serialize quota/request changes while recomputing the reviewed snapshot.
    LOCK TABLE tbs_employees, leave_requests, leave_quotas IN SHARE ROW EXCLUSIVE MODE;
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p."userId"),'[]'::jsonb) INTO rows FROM (
    SELECT e.user_id AS "userId",concat_ws(' ',e.first_name,e.last_name) AS name,
      e.nickname,e.tbs_id AS "empNo",
      balance.unused AS "unusedAnnual",
      balance.unused AS "suggestedCarryover",
      COALESCE(q.annual_total,0)+COALESCE(q.carried_over,0) AS "sourceAnnual", COALESCE(q.carried_over,0) AS "sourceCarried",
      CASE WHEN reconcile THEN COALESCE(next_q.note,'') ELSE '' END AS note,
      CASE WHEN reconcile THEN next_q.annual_total ELSE q.annual_total END AS "annualTotal",
      CASE WHEN reconcile THEN next_q.sick_total ELSE q.sick_total END AS "sickTotal",
      CASE WHEN reconcile THEN next_q.personal_total ELSE q.personal_total END AS "personalTotal",
      CASE WHEN reconcile THEN LEAST(balance.unused,GREATEST(0,COALESCE(next_q.carried_over,0)+balance.unused-next_q.rollover_source_unused)) ELSE balance.unused END AS "carriedOver",
      next_q.carried_over AS "previousCarryover",
      CASE WHEN reconcile THEN next_q.carryover_expires_on ELSE expiry END AS "expiresOn",
      CASE WHEN q.user_id IS NULL OR q.annual_total IS NULL OR q.personal_total IS NULL THEN 'Missing source quota — skipped'
        WHEN reconcile AND (next_q.rollover_source_year IS DISTINCT FROM yr OR next_q.rollover_source_unused IS NULL) THEN 'No tracked rollover — skipped'
        WHEN reconcile AND next_q.rollover_source_unused=balance.unused THEN 'Up to date — skipped'
        WHEN NOT reconcile AND next_q.user_id IS NOT NULL THEN 'Existing next-year quota — skipped'
        ELSE 'Ready' END AS status
    FROM tbs_employees e LEFT JOIN leave_quotas q ON q.user_id=e.user_id AND q.year=yr
    LEFT JOIN leave_quotas next_q ON next_q.user_id=e.user_id AND next_q.year=yr+1
    CROSS JOIN LATERAL tbs_quota_usage(e.user_id,yr,make_date(yr,12,31)) u
    CROSS JOIN LATERAL (SELECT tbs_rollover_unused(e.user_id,yr) AS unused) balance
    WHERE e.status='active'
  ) p;
  IF payload ? 'overrides' AND (jsonb_typeof(payload->'overrides') IS DISTINCT FROM 'array') THEN
    RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Employee adjustments must be an array');
  END IF;
  IF jsonb_array_length(COALESCE(payload->'overrides','[]'::jsonb))>500 OR
    (SELECT count(*)<>count(DISTINCT value->>'userId') FROM jsonb_array_elements(COALESCE(payload->'overrides','[]'::jsonb))) THEN
    RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid or duplicate employee adjustments');
  END IF;
  FOR override_row IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'overrides','[]'::jsonb)) LOOP
    SELECT value INTO employee_row FROM jsonb_array_elements(rows) WHERE value->>'userId'=override_row->>'userId';
    amount:=(override_row->>'carriedOver')::numeric;
    employee_expiry:=(override_row->>'expiresOn')::date;
    IF employee_row IS NULL OR employee_row->>'status'<>'Ready' OR amount IS NULL OR amount<0 OR amount>365
      OR amount*4<>trunc(amount*4) OR amount>(employee_row->>'unusedAnnual')::numeric
      OR (employee_expiry IS NULL AND NOT reconcile) OR extract(year FROM employee_expiry)<>yr+1
      OR jsonb_typeof(override_row->'note') IS DISTINCT FROM 'string' OR length(override_row->>'note')>1000
 THEN
      RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Adjust ready employees only. Carryover cannot exceed unused annual leave; expiry must be in the next year.');
    END IF;
    FOREACH field IN ARRAY ARRAY['annualTotal','sickTotal','personalTotal'] LOOP
      IF override_row ? field AND NOT reconcile THEN
        quota_value := (override_row->>field)::numeric;
        IF (quota_value IS NULL AND field<>'sickTotal') OR quota_value<0 OR quota_value>365 OR quota_value*4<>trunc(quota_value*4) THEN
          RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Allowances must be 0–365 in quarter days; only sick leave can be unlimited.');
        END IF;
        employee_row := employee_row || jsonb_build_object(field,quota_value);
      END IF;
    END LOOP;
    SELECT jsonb_agg(CASE WHEN value->>'userId'=override_row->>'userId' THEN employee_row||jsonb_build_object('carriedOver',amount,'expiresOn',employee_expiry,'note',trim(override_row->>'note')) ELSE value END ORDER BY value->>'userId') INTO rows FROM jsonb_array_elements(rows);
  END LOOP;
  -- Include original records, even when edits hide a changed source value.
  SELECT md5(COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.user_id,q.year)::text FROM leave_quotas q WHERE year IN (yr,yr+1)),'[]') ||
    COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM leave_requests r),'[]')) INTO fingerprint;
  token := md5(rows::text || yr::text || expiry::text || reconcile::text || fingerprint);
  IF payload->>'action'='apply' THEN
    IF payload->>'token' IS DISTINCT FROM token THEN
      RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Allowances or leave changed since review. Refresh and review again before applying.');
    END IF;
    PERFORM set_config('app.tbs_action','rollover',true);
    PERFORM set_config('app.tbs_channel','dashboard',true);
    IF reconcile THEN
      UPDATE leave_quotas q SET carried_over=(r.value->>'carriedOver')::numeric,
        carryover_expires_on=(r.value->>'expiresOn')::date,note=r.value->>'note',
        rollover_source_unused=(r.value->>'unusedAnnual')::numeric,updated_at=now()
      FROM jsonb_array_elements(rows) r(value)
      WHERE r.value->>'status'='Ready' AND q.user_id=r.value->>'userId' AND q.year=yr+1;
      GET DIAGNOSTICS saved_count = ROW_COUNT;
    ELSE
    INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over,carryover_expires_on,note,updated_at,rollover_source_year,rollover_source_unused)
      SELECT value->>'userId',yr+1,(value->>'annualTotal')::numeric,(value->>'sickTotal')::numeric,
        (value->>'personalTotal')::numeric,(value->>'carriedOver')::numeric,(value->>'expiresOn')::date,value->>'note',now(),yr,(value->>'unusedAnnual')::numeric
      FROM jsonb_array_elements(rows) WHERE value->>'status'='Ready';
    GET DIAGNOSTICS saved_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object('ok',true,'saved',saved_count,'targetYear',yr+1);
  END IF;
  RETURN jsonb_build_object('ok',true,'rows',rows,'token',token,'targetYear',yr+1);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid rollover settings');
END;
$$;
COMMIT;
