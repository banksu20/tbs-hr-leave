SELECT e.user_id, e.tbs_id, e.first_name, e.last_name, e.nickname, e.department,
  COALESCE(e.status, 'active') AS status,
  to_char(e.start_date, 'YYYY-MM-DD') AS start_date,
  q.annual_total AS "annualTotal", q.sick_total AS "sickTotal",
  COALESCE(q.personal_total, 3) AS "personalTotal", COALESCE(q.carried_over, 0) AS "carriedOver",
  (q.user_id IS NOT NULL) AS "quotasKnown", COALESCE(q.note, '') AS "quotaNote",
  COALESCE(json_agg(json_build_object(
    'id', r.id::text, 'leave_type', r.leave_type, 'leave_days', r.leave_days,
    'start_date', to_char(r.start_date, 'YYYY-MM-DD'), 'end_date', to_char(r.end_date, 'YYYY-MM-DD'),
    'selected_dates', tbs_request_dates(r.selected_dates::text, r.start_date::date, r.end_date::date),
    'reason', r.reason, 'status', r.status, 'half_day_period', r.half_day_period
  ) ORDER BY r.start_date, r.id) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS requests
FROM tbs_employees e
LEFT JOIN leave_quotas q ON q.user_id = e.user_id AND q.year = $1::int
LEFT JOIN leave_requests r ON r.user_id = e.user_id AND r.status != 'Rejected'
  AND EXISTS (SELECT 1 FROM unnest(tbs_request_dates(r.selected_dates::text, r.start_date::date, r.end_date::date)) day
    WHERE day >= make_date($1::int, 1, 1) AND day < make_date($1::int + 1, 1, 1))
GROUP BY e.user_id, e.tbs_id, e.first_name, e.last_name, e.nickname, e.department, e.status, e.start_date,
  q.user_id, q.annual_total, q.sick_total, q.personal_total, q.carried_over, q.note
ORDER BY e.tbs_id;
