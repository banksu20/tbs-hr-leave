WITH job AS (SELECT * FROM tbs_claim_sync('sheet')),
records AS (SELECT r.* FROM leave_requests r JOIN job j ON r.user_id=j.user_id),
versions AS (
 SELECT to_jsonb(r) AS value FROM records r
 UNION ALL SELECT h.before_value FROM tbs_change_history h JOIN job j ON h.user_id=j.user_id WHERE h.entity='leave_requests' AND h.before_value IS NOT NULL
),
known AS (
 SELECT to_char(d,'YYYY-MM-DD') AS date,
 CASE WHEN lower(v.value->>'leave_type') IN ('annual','vacation','annual leave') THEN 'annual' ELSE lower(v.value->>'leave_type') END AS type,
 (v.value->>'leave_days')::numeric/cardinality(tbs_request_dates(v.value->>'selected_dates',(v.value->>'start_date')::date,(v.value->>'end_date')::date)) AS days
 FROM versions v CROSS JOIN LATERAL unnest(tbs_request_dates(v.value->>'selected_dates',(v.value->>'start_date')::date,(v.value->>'end_date')::date)) d JOIN job j ON extract(year FROM d)=j.year
),
entries AS (
 SELECT r.id AS "requestId",to_char(d,'YYYY-MM-DD') AS date,
 CASE WHEN lower(r.leave_type) IN ('annual','vacation','annual leave') THEN 'annual' ELSE lower(r.leave_type) END AS type,
 r.leave_days/cardinality(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date)) AS days,
 r.half_day_period AS period,r.reason,COALESCE(r.status,'Pending') AS status
 FROM records r CROSS JOIN LATERAL unnest(tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date)) d JOIN job j ON extract(year FROM d)=j.year
)
SELECT j.*,jsonb_build_object('year',j.year,
 'requireVerifiedLink',true,
 'sheetHeader',(SELECT header FROM tbs_sheet_employee_links m WHERE m.user_id=j.user_id AND m.year=j.year),
 'sheetName',COALESCE((SELECT sheet_name FROM tbs_sheet_employee_links m WHERE m.user_id=j.user_id AND m.year=j.year),'Leave report '||j.year),
 'databaseAuthoritative',COALESCE((SELECT database_authoritative FROM tbs_sheet_employee_links m WHERE m.user_id=j.user_id AND m.year=j.year),false),
 'names',(SELECT jsonb_agg(DISTINCT name) FROM (SELECT concat_ws(' ',e.first_name,e.last_name) AS name UNION SELECT r.user_name FROM records r) names),
 'known',COALESCE((SELECT jsonb_agg(to_jsonb(k)) FROM known k),'[]'),
 'entries',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM entries r),'[]'),
 'quota',(SELECT to_jsonb(q) FROM leave_quotas q WHERE q.user_id=j.user_id AND q.year=j.year),
 'carried',(SELECT effective_carried FROM tbs_quota_usage(j.user_id,j.year))) AS snapshot
FROM job j JOIN tbs_employees e ON e.user_id=j.user_id;
