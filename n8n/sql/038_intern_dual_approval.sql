BEGIN;
CREATE OR REPLACE FUNCTION tbs_intern_approvers() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(DISTINCT id),'[]'::jsonb) FROM (
  SELECT hr_line_id AS id FROM tbs_policy_routing WHERE singleton
  UNION SELECT ceo_account_id FROM tbs_cancellation_line_settings WHERE singleton
 ) recipients WHERE COALESCE(id,'')<>'';
$$;
DO $$ DECLARE def text; fn text; BEGIN
 SELECT pg_get_functiondef('tbs_employee_request(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'SELECT jsonb_build_array(hr_line_id) INTO recipients FROM tbs_policy_routing WHERE singleton','SELECT tbs_intern_approvers() INTO recipients');EXECUTE def;
 FOREACH fn IN ARRAY ARRAY['tbs_line_decision(text,jsonb)','tbs_intern_decision(jsonb)'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(fn)) INTO def;
  def:=replace(def,'COALESCE(payload->>''accountId'','''') IS DISTINCT FROM (SELECT hr_line_id FROM tbs_policy_routing WHERE singleton)',
   'NOT (tbs_intern_approvers() ? COALESCE(payload->>''accountId'',''''))');
  def:=replace(def,'Open this request using Nam’s LINE account.','Open this request using Dan’s or Nam’s LINE account.');
  EXECUTE def;
 END LOOP;
END $$;
COMMIT;
