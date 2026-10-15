-- Explain closed requests without allowing stale LINE cards to change a decision.
BEGIN;
CREATE OR REPLACE FUNCTION tbs_closed_request_message(request_id integer, request_status text)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE event tbs_change_history%ROWTYPE; state text; happened text;
BEGIN
 SELECT * INTO event FROM tbs_change_history
 WHERE entity='leave_requests' AND record_id=request_id::text
   AND before_value->>'status' IS DISTINCT FROM after_value->>'status'
   AND after_value->>'status'=request_status
 ORDER BY id DESC LIMIT 1;
 state:=CASE WHEN event.action='cancel' THEN 'cancelled'
   WHEN lower(request_status)='approved' THEN 'approved'
   WHEN lower(request_status)='rejected' THEN 'rejected' ELSE 'closed' END;
 happened:=CASE WHEN event.changed_at IS NOT NULL THEN ' on '||to_char(event.changed_at AT TIME ZONE 'Asia/Bangkok','DD Mon YYYY "at" HH24:MI')||' (Bangkok time)' ELSE '' END;
 RETURN 'This request was already '||state||happened||'. This old card cannot change it. Open the dashboard to view the current record.';
END $$;
DO $$
DECLARE target regprocedure; definition text;
BEGIN
 target:=COALESCE(to_regprocedure('tbs_dashboard_request_v2_before_policy(text,jsonb)'),to_regprocedure('tbs_dashboard_request_v2(text,jsonb)'));
 SELECT pg_get_functiondef(target) INTO definition;
 IF position('This request is no longer awaiting approval. Refresh the dashboard.' IN definition)>0 THEN
   definition:=replace(definition,quote_literal('This request is no longer awaiting approval. Refresh the dashboard.'),'tbs_closed_request_message(current_row.id,current_row.status)');
   EXECUTE definition;
 ELSIF position('tbs_closed_request_message(current_row.id,current_row.status)' IN definition)=0 THEN
   RAISE EXCEPTION 'Expected decision guard not found';
 END IF;
END $$;
COMMIT;
