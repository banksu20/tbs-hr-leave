BEGIN;
DO $$ DECLARE f oid; n integer:=0;
 old_ops text:='op NOT IN (''travel-trips'',''travel-trip'',''travel-receipt'',''travel-mark'',''travel-payout'',''travel-payout-paid'')';
 new_ops text:='op NOT IN (''travel-trips'',''travel-trip'',''travel-receipt'',''travel-mark'',''travel-payout'',''travel-payout-paid'',''travel-decide'')';
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=current_schema() AND p.proname LIKE 'tbs_dashboard_auth%' AND position(old_ops IN p.prosrc)>0 LOOP
  EXECUTE replace(pg_get_functiondef(f),old_ops,new_ops);
  n:=n+1;
 END LOOP;
 IF n=0 AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE proname LIKE 'tbs_dashboard_auth%' AND position(new_ops IN prosrc)>0) THEN
  RAISE EXCEPTION 'accounting gate changed; travel-decide not added';
 END IF;
END $$;
COMMIT;
