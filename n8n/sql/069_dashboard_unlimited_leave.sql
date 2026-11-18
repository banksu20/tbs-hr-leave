BEGIN;
DO $$
BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_unlimited(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_unlimited;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:=tbs_dashboard_auth_before_unlimited(payload);
BEGIN
 IF payload->>'operation'='data' AND jsonb_typeof(result->'employees')='array' THEN
  result:=jsonb_set(result,'{employees}',COALESCE((SELECT jsonb_agg(x||jsonb_build_object('unlimited_leave',COALESCE(tbs_leave_unlimited(x->>'user_id'),false)) ORDER BY n)
   FROM jsonb_array_elements(result->'employees') WITH ORDINALITY t(x,n)),'[]'::jsonb));
 END IF;
 RETURN result;
END $$;
COMMIT;
