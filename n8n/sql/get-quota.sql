WITH allocated AS (
  SELECT r.leave_type,
    r.leave_days / NULLIF(cardinality(d.dates), 0) *
      (SELECT count(*) FROM unnest(d.dates) day WHERE extract(year FROM day) = $2::int) AS days
  FROM leave_requests r
  CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates::text, r.start_date::date, r.end_date::date) AS dates) d
  WHERE r.user_id = $1 AND r.status != 'Rejected'
), taken AS (
  SELECT COALESCE(sum(days) FILTER (WHERE lower(leave_type) IN ('annual', 'vacation')), 0) AS annual,
    COALESCE(sum(days) FILTER (WHERE lower(leave_type) = 'sick'), 0) AS sick,
    COALESCE(sum(days) FILTER (WHERE lower(leave_type) = 'personal'), 0) AS personal
  FROM allocated
)
SELECT q.annual_total::float8 AS "annualTotal", q.sick_total::float8 AS "sickTotal",
  q.personal_total::float8 AS "personalTotal", q.carried_over::float8 AS "carriedOver", q.note AS "quotaNote",
  t.annual::float8 AS "annualTaken", t.sick::float8 AS "sickTaken", t.personal::float8 AS "personalTaken",
  (q.annual_total + q.carried_over - t.annual)::float8 AS "remainingDays",
  (q.sick_total - t.sick)::float8 AS "sickRemaining",
  (q.personal_total - t.personal)::float8 AS "personalRemaining"
FROM leave_quotas q CROSS JOIN taken t WHERE q.user_id = $1 AND q.year = $2::int;
