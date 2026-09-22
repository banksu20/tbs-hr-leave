SELECT q.annual_total::float8 AS "annualTotal", q.sick_total::float8 AS "sickTotal",
 q.personal_total::float8 AS "personalTotal", u.effective_carried::float8 AS "carriedOver", q.note AS "quotaNote",
 u.annual::float8 AS "annualTaken",u.sick::float8 AS "sickTaken",u.personal::float8 AS "personalTaken",
 (q.annual_total+u.effective_carried-u.annual)::float8 AS "remainingDays",
 (q.sick_total-u.sick)::float8 AS "sickRemaining",(q.personal_total-u.personal)::float8 AS "personalRemaining"
FROM leave_quotas q CROSS JOIN LATERAL tbs_quota_usage(q.user_id,q.year) u
WHERE q.user_id=$1 AND q.year=$2::integer;
