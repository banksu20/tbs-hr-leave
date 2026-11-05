BEGIN;
DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_university_evidence(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_university_evidence;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; uid text; item uuid; doc jsonb:=payload->'body'->'evidence'; bytes bytea; result jsonb;
 previous text:=COALESCE(current_setting('app.tbs_evidence_ids',true),'');
BEGIN
 IF doc IS NULL OR doc='null'::jsonb THEN RETURN tbs_dashboard_auth_before_university_evidence(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 uid:=tbs_resolve_employee(payload->'body'->>'userId');
 IF actor.role NOT IN ('admin','ceo','hr') OR payload->>'operation'<>'leave-create' OR payload->'body'->>'leaveType'<>'university'
 OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND employment_type='intern') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',403,'error','University evidence is only available for intern leave creation');
 END IF;
 IF jsonb_typeof(doc)<>'object' OR COALESCE(length(doc->>'content'),0)>2800000 OR COALESCE(trim(doc->>'filename'),'')='' THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Use a valid PDF, PNG or JPEG up to 2 MB.');
 END IF;
 bytes:=decode(doc->>'content','base64');
 IF COALESCE(octet_length(bytes),0) NOT BETWEEN 1 AND 2097152 OR NOT COALESCE(
 (doc->>'mime'='application/pdf' AND substring(bytes from 1 for 5)=decode('255044462d','hex')) OR
 (doc->>'mime'='image/png' AND substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')) OR
 (doc->>'mime'='image/jpeg' AND substring(bytes from 1 for 3)=decode('ffd8ff','hex')),false) THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Use a valid PDF, PNG or JPEG up to 2 MB.');
 END IF;
 INSERT INTO tbs_leave_evidence(user_id,filename,mime,content,document_type)
 VALUES(uid,left(doc->>'filename',150),doc->>'mime',bytes,'activity') RETURNING id INTO item;
 PERFORM set_config('app.tbs_evidence_ids',jsonb_build_array(item)::text,true);
 -- Keep document bytes out of the dashboard audit payload.
 result:=tbs_dashboard_auth_before_university_evidence(payload #- '{body,evidence}');
 PERFORM set_config('app.tbs_evidence_ids',previous,true);
 IF NOT COALESCE((result->>'ok')::boolean,false) THEN DELETE FROM tbs_leave_evidence WHERE id=item; END IF;
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tbs_evidence_ids',previous,true);RAISE;
END $$;
COMMIT;
