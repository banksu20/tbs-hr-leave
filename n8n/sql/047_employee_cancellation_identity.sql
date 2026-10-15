BEGIN;
CREATE OR REPLACE FUNCTION tbs_employee_actor_label(account_id text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(e.nickname,''),NULLIF(btrim(concat_ws(' ',e.first_name,e.last_name)),''),'Employee')||' · LINE'
 FROM tbs_employees e WHERE e.user_id=tbs_resolve_employee(account_id)
$$;
DO $$ DECLARE definition text; BEGIN
 IF to_regprocedure('tbs_cancellation_before_employee_identity(text,jsonb)') IS NULL THEN
  SELECT pg_get_functiondef('tbs_cancellation(text,jsonb)'::regprocedure) INTO definition;
  definition:=replace(definition,quote_literal('Verified LINE employee'),'COALESCE(tbs_employee_actor_label(payload->>''accountId''),''Verified LINE employee'')');
  EXECUTE definition;
  ALTER FUNCTION tbs_cancellation(text,jsonb) RENAME TO tbs_cancellation_before_employee_identity;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE previous text:=COALESCE(current_setting('app.tbs_actor_label',true),''); result jsonb;
BEGIN
 IF operation='request' THEN
  PERFORM set_config('app.tbs_actor_label',COALESCE(tbs_employee_actor_label(payload->>'accountId'),'Verified LINE employee'),true);
 END IF;
 result:=tbs_cancellation_before_employee_identity(operation,payload);
 PERFORM set_config('app.tbs_actor_label',previous,true);
 RETURN result;
END $$;
-- Backfill only employee-originated events with a recorded verified account.
UPDATE tbs_change_history h SET actor=tbs_employee_actor_label(COALESCE(h.after_value->>'accountId',h.after_value->>'account_user_id'))
WHERE h.entity='employee_cancellation' AND h.action IN ('cancel','request cancellation')
 AND h.actor='Verified LINE employee'
 AND tbs_employee_actor_label(COALESCE(h.after_value->>'accountId',h.after_value->>'account_user_id')) IS NOT NULL;
-- A pending cancellation writes the leave change immediately before its employee audit.
-- Require the same record/owner, nearest preceding leave event and a one-second window.
WITH matches AS (
 SELECT c.actor, prior.id FROM tbs_change_history c
 CROSS JOIN LATERAL (SELECT h.id,h.actor,h.action,h.changed_at FROM tbs_change_history h
  WHERE h.entity='leave_requests' AND h.record_id=c.record_id AND h.user_id=c.user_id AND h.id<c.id
  ORDER BY h.id DESC LIMIT 1) prior
 WHERE c.entity='employee_cancellation' AND c.action='cancel' AND c.actor LIKE '% · LINE'
  AND c.after_value->>'accountId' IS NOT NULL
  AND prior.action IN ('cancel','update') AND prior.actor IN ('Dashboard — user not identified','LINE — user not identified')
  AND c.changed_at>=prior.changed_at AND c.changed_at-prior.changed_at<=interval '1 second'
)
UPDATE tbs_change_history h SET actor=m.actor FROM matches m WHERE h.id=m.id;
COMMIT;
