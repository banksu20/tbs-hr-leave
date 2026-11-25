BEGIN;
CREATE INDEX IF NOT EXISTS tbs_dashboard_account_audit_form_email ON tbs_dashboard_account_audit(target,created_at DESC) WHERE action='travel-form-email';
CREATE OR REPLACE FUNCTION tbs_travel_form_last_email(uid text,m text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('at',a.created_at,'by',COALESCE(d.username,''))
 FROM tbs_dashboard_account_audit a LEFT JOIN tbs_dashboard_accounts d ON d.id=a.actor_id
 WHERE a.action='travel-form-email' AND a.target=uid||' '||m ORDER BY a.created_at DESC LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; r jsonb; m text; BEGIN
 IF op='travel-form-email' THEN
  SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
  IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
  r:=tbs_travel_form_email(COALESCE(payload->'body','{}'::jsonb),actor);
  IF COALESCE((r->>'ok')::boolean,false) THEN
   r:=r||jsonb_build_object('lastEmail',tbs_travel_form_last_email(payload->'body'->>'userId',to_char(tbs_travel_payout_month(payload->'body'->>'month'),'YYYY-MM')));
  END IF;
  RETURN r;
 END IF;
 r:=tbs_dashboard_auth_before_form_email(payload);
 IF NOT COALESCE((r->>'ok')::boolean,false) THEN RETURN r; END IF;
 IF op IN ('travel-form','travel-form-save','travel-form-reset') THEN
  r:=r||jsonb_build_object('mailTo',(SELECT tbs_mask_email(accounting_email) FROM tbs_travel_settings WHERE singleton),
   'lastEmail',tbs_travel_form_last_email(r->>'userId',r->>'month'));
 ELSIF op IN ('travel-payout','travel-payout-paid') AND jsonb_typeof(r->'people')='array' THEN
  m:=to_char(tbs_travel_payout_month(payload->'body'->>'month'),'YYYY-MM');
  r:=jsonb_set(r,'{people}',(SELECT COALESCE(jsonb_agg(x||jsonb_build_object('formEmailedAt',tbs_travel_form_last_email(x->>'userId',m)->'at') ORDER BY o),'[]'::jsonb)
   FROM jsonb_array_elements(r->'people') WITH ORDINALITY e(x,o)));
 END IF;
 RETURN r;
END $$;
COMMIT;
