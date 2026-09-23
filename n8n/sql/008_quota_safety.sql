BEGIN;
CREATE OR REPLACE FUNCTION tbs_update_quota(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE q leave_quotas%ROWTYPE; yr integer; field text; amount numeric; expiry date; revision text;
BEGIN
 yr:=(payload->>'year')::integer;
 IF yr IS NULL OR yr NOT BETWEEN 2000 AND 2100 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid quota year'); END IF;
 PERFORM 1 FROM tbs_employees WHERE user_id=payload->>'userId' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Employee not found'); END IF;
 SELECT * INTO q FROM leave_quotas WHERE user_id=payload->>'userId' AND year=yr FOR UPDATE;
 revision:=CASE WHEN FOUND THEN md5(to_jsonb(q)::text) ELSE 'missing' END;
 IF payload->>'expectedRevision' IS DISTINCT FROM revision THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Allowances changed. Refresh and reopen the quota editor before saving.'); END IF;
 FOREACH field IN ARRAY ARRAY['annualTotal','sickTotal','personalTotal','carriedOver'] LOOP
  IF payload ? field THEN
   IF jsonb_typeof(payload->field) NOT IN ('number','null') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Allowances must be numbers'); END IF;
   amount:=(payload->>field)::numeric;
   IF (amount IS NULL AND field NOT IN ('annualTotal','sickTotal')) OR amount<0 OR amount>365 OR amount*4<>trunc(amount*4) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Use 0–365 days in quarter-day increments'); END IF;
  END IF;
 END LOOP;
 IF payload ? 'carryoverExpiresOn' THEN
  expiry:=(payload->>'carryoverExpiresOn')::date;
  IF expiry IS NOT NULL AND extract(year FROM expiry)<>yr THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Carryover expiry must be within the quota year'); END IF;
 END IF;
 IF payload ? 'note' AND (jsonb_typeof(payload->'note') IS DISTINCT FROM 'string' OR length(payload->>'note')>1000) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid quota note'); END IF;
 PERFORM set_config('app.tbs_action','quota',true);
 PERFORM set_config('app.tbs_channel','dashboard',true);
 INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over,note,carryover_expires_on,updated_at)
 VALUES(payload->>'userId',yr,(payload->>'annualTotal')::numeric,(payload->>'sickTotal')::numeric,COALESCE((payload->>'personalTotal')::numeric,3),COALESCE((payload->>'carriedOver')::numeric,0),COALESCE(payload->>'note',''),expiry,now())
 ON CONFLICT(user_id,year) DO UPDATE SET
 annual_total=CASE WHEN payload?'annualTotal' THEN (payload->>'annualTotal')::numeric ELSE leave_quotas.annual_total END,
 sick_total=CASE WHEN payload?'sickTotal' THEN (payload->>'sickTotal')::numeric ELSE leave_quotas.sick_total END,
 personal_total=CASE WHEN payload?'personalTotal' THEN (payload->>'personalTotal')::numeric ELSE leave_quotas.personal_total END,
 carried_over=CASE WHEN payload?'carriedOver' THEN (payload->>'carriedOver')::numeric ELSE leave_quotas.carried_over END,
 carryover_expires_on=CASE WHEN payload?'carryoverExpiresOn' THEN expiry ELSE leave_quotas.carryover_expires_on END,
 note=CASE WHEN payload?'note' THEN payload->>'note' ELSE leave_quotas.note END,updated_at=now()
 RETURNING * INTO q;
 RETURN jsonb_build_object('ok',true,'quotaRevision',md5(to_jsonb(q)::text));
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
 RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid quota values');
END;
$$;
COMMIT;
