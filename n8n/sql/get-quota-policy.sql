SELECT (e.employment_type='employee' OR t.user_id IS NOT NULL) AS "policyConfigured",
 CASE WHEN tbs_leave_unlimited(e.user_id) THEN NULL WHEN e.employment_type='intern' THEN (b.a->>'total')::float8 ELSE q.annual_total::float8 END AS "annualTotal",
 CASE WHEN tbs_leave_unlimited(e.user_id) THEN NULL WHEN e.employment_type='intern' THEN (b.s->>'total')::float8 ELSE 30::float8 END AS "sickTotal",
 CASE WHEN tbs_leave_unlimited(e.user_id) THEN NULL ELSE 3::float8 END AS "personalTotal",
 tbs_leave_unlimited(e.user_id) AS "unlimitedLeave",
 CASE WHEN e.employment_type='intern' THEN 0 ELSE u.effective_carried::float8 END AS "carriedOver",q.note AS "quotaNote",
 CASE WHEN e.employment_type='intern' THEN (b.a->>'approved')::float8 ELSE u.annual::float8 END AS "annualTaken",
 CASE WHEN e.employment_type='intern' THEN (b.s->>'approved')::float8 ELSE u.sick::float8 END AS "sickTaken",
 CASE WHEN e.employment_type='intern' THEN (b.p->>'approved')::float8 ELSE u.personal::float8 END AS "personalTaken",
 CASE WHEN tbs_leave_unlimited(e.user_id) THEN NULL WHEN e.employment_type='intern' THEN (b.a->>'total')::float8-(b.a->>'approved')::float8 ELSE (q.annual_total+u.effective_carried-u.annual)::float8 END AS "remainingDays",
 CASE WHEN tbs_leave_unlimited(e.user_id) THEN NULL WHEN e.employment_type='intern' THEN (b.s->>'total')::float8-(b.s->>'approved')::float8 ELSE (30-u.sick)::float8 END AS "sickRemaining",
 CASE WHEN tbs_leave_unlimited(e.user_id) THEN NULL WHEN e.employment_type='intern' THEN 3-(b.p->>'approved')::float8 ELSE (3-u.personal)::float8 END AS "personalRemaining"
FROM tbs_employees e LEFT JOIN leave_quotas q ON q.user_id=e.user_id AND q.year=$2::integer LEFT JOIN tbs_intern_terms t ON t.user_id=e.user_id
CROSS JOIN LATERAL tbs_quota_usage(e.user_id,$2::integer) u
CROSS JOIN LATERAL (SELECT tbs_leave_balance(e.user_id,$2::integer,'annual') a,tbs_leave_balance(e.user_id,$2::integer,'sick') s,tbs_leave_balance(e.user_id,$2::integer,'personal') p) b
WHERE e.user_id=tbs_resolve_employee($1);
