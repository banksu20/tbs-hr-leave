-- Sick allowance across the whole internship: 4 months = 10, 6 months = 15.
BEGIN;
CREATE OR REPLACE FUNCTION tbs_leave_balance(uid text,yr integer,kind text,candidate date[] DEFAULT '{}',per_day numeric DEFAULT 0,excluded_id integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE terms tbs_intern_terms%ROWTYPE; allowance numeric; approved numeric; pending numeric; requested numeric; valid boolean;
BEGIN
 uid:=tbs_resolve_employee(uid);
 IF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern') THEN RETURN tbs_leave_balance_fulltime(uid,yr,kind,candidate,per_day,excluded_id); END IF;
 SELECT * INTO terms FROM tbs_intern_terms WHERE user_id=uid;
 allowance:=CASE WHEN kind='personal' THEN 3 WHEN kind='sick' THEN CASE terms.months WHEN 4 THEN 10 WHEN 6 THEN 15 END WHEN kind='annual' THEN CASE terms.months WHEN 4 THEN 2 WHEN 6 THEN 3 END END;
 SELECT COALESCE(sum(r.leave_days/cardinality(ds.dates)) FILTER(WHERE r.status='Approved'),0),COALESCE(sum(r.leave_days/cardinality(ds.dates)) FILTER(WHERE r.status='Pending'),0) INTO approved,pending
 FROM leave_requests r CROSS JOIN LATERAL (SELECT tbs_request_dates(r.selected_dates,r.start_date::date,r.end_date::date) dates) ds CROSS JOIN LATERAL unnest(ds.dates) d
 WHERE r.user_id=uid AND r.id IS DISTINCT FROM excluded_id AND (lower(r.leave_type)=kind OR kind='annual' AND lower(r.leave_type)='vacation') AND d BETWEEN terms.start_date AND terms.end_date;
 requested:=COALESCE(cardinality(candidate),0)*per_day;
 valid:=terms.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM unnest(candidate) d WHERE d<terms.start_date OR d>terms.end_date);
 RETURN jsonb_build_object('year',yr,'type',kind,'period','internship','unlimited',kind='university','known',terms.user_id IS NOT NULL,'total',allowance,'approved',approved,'pending',pending,'requested',requested,'available',GREATEST(0,allowance-approved-pending),'allowed',valid AND (kind='university' OR approved+pending+requested<=allowance));
END $$;
COMMIT;
