-- Advance-notice deadlines use calendar days; sick leave keeps same-day 08:30 Bangkok.
BEGIN;
CREATE OR REPLACE FUNCTION tbs_policy_deadline(uid text,kind text,d date) RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE prior date; BEGIN
 IF d IS NULL THEN RETURN NULL; END IF;
 IF kind='sick' THEN RETURN (d+time '08:30') AT TIME ZONE 'Asia/Bangkok'; END IF;
 IF kind IN ('personal','university') THEN prior:=d-1;
 ELSIF kind IN ('annual','vacation') THEN prior:=d-CASE WHEN EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=tbs_resolve_employee(uid) AND employment_type='intern') THEN 3 ELSE 1 END;
 ELSE RETURN NULL; END IF;
 RETURN (prior+time '16:30') AT TIME ZONE 'Asia/Bangkok';
END $$;
COMMIT;
