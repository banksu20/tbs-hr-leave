BEGIN;
ALTER TABLE leave_quotas ADD COLUMN IF NOT EXISTS carryover_expires_on date;

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

CREATE OR REPLACE FUNCTION tbs_rollover(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE yr integer; cap numeric; expiry date; rows jsonb; token text;
BEGIN
  yr := (payload->>'sourceYear')::integer;
  cap := (payload->>'carryLimit')::numeric;
  expiry := (payload->>'expiresOn')::date;
  IF yr IS NULL OR yr NOT BETWEEN 2000 AND 2099 OR cap IS NULL OR cap<0 OR cap>365 OR cap*4<>trunc(cap*4)
    OR expiry IS NULL OR extract(year FROM expiry)<>yr+1 OR payload->>'action' IS NULL OR payload->>'action' NOT IN ('preview','apply') THEN
    RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose a source year, carryover limit in quarter days, and expiry within the next year.');
  END IF;
  IF payload->>'action'='apply' THEN
    RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Year rollover is preview-only until the policy is approved and applying is enabled.');
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p."userId"),'[]'::jsonb) INTO rows FROM (
    SELECT e.user_id AS "userId",concat_ws(' ',e.first_name,e.last_name) AS name,
      q.annual_total AS "annualTotal",q.sick_total AS "sickTotal",q.personal_total AS "personalTotal",
      LEAST(cap,GREATEST(q.annual_total-GREATEST(u.annual-u.effective_carried,0),0)) AS "carriedOver",
      expiry AS "expiresOn",
      CASE WHEN next_q.user_id IS NOT NULL THEN 'Existing next-year quota — skipped'
        WHEN q.user_id IS NULL OR q.annual_total IS NULL OR q.sick_total IS NULL OR q.personal_total IS NULL THEN 'Missing source quota — skipped'
        ELSE 'Ready' END AS status
    FROM tbs_employees e LEFT JOIN leave_quotas q ON q.user_id=e.user_id AND q.year=yr
    LEFT JOIN leave_quotas next_q ON next_q.user_id=e.user_id AND next_q.year=yr+1
    CROSS JOIN LATERAL tbs_quota_usage(e.user_id,yr,make_date(yr,12,31)) u
    WHERE e.status='active'
  ) p;
  token := md5(rows::text || yr::text || cap::text || expiry::text);
  RETURN jsonb_build_object('ok',true,'rows',rows,'token',token,'targetYear',yr+1);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid rollover settings');
END;
$$;
COMMIT;
