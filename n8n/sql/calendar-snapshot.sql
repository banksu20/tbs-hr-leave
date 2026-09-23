-- Read-only snapshot. Dates before the integration start are never imported.
WITH employees AS (
 SELECT user_id, tbs_id AS "empNo", concat_ws(' ',first_name,last_name) AS name,
   nickname, COALESCE(status,'active') AS status FROM tbs_employees
), entries AS (
 SELECT r.id::text AS "requestId",r.user_id AS "userId",to_char(d,'YYYY-MM-DD') AS date,
   lower(r.leave_type) AS type,r.leave_days / cardinality(days.dates) AS days,
   r.half_day_period AS period,r.status
 FROM leave_requests r
 CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) AS dates) days
 CROSS JOIN LATERAL unnest(days.dates) d
 WHERE r.status='Approved' AND d >= $1::date
), event_keys AS (
 SELECT DISTINCT "userId",date,'tbsleave'||md5("userId"||':'||date) AS "eventId" FROM entries
)
SELECT $1::text AS "startDate",
 to_char(GREATEST((CURRENT_DATE + interval '2 years')::date,COALESCE((SELECT max(date)::date+1 FROM entries),CURRENT_DATE)),'YYYY-MM-DD') AS "endDate",
 COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM employees e),'[]'::jsonb) AS employees,
 COALESCE((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('eventId',k."eventId")) FROM entries e JOIN event_keys k USING("userId",date)),'[]'::jsonb) AS entries;
