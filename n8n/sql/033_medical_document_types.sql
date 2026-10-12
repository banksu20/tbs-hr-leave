BEGIN;
-- Existing unclassified documents are not assumed to be medical certificates.
ALTER TABLE tbs_leave_evidence ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'other' CHECK (document_type IN ('certificate','bill','activity','other'));
CREATE OR REPLACE FUNCTION tbs_evidence(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; uid text; item tbs_leave_evidence%ROWTYPE; rid integer:=NULLIF(payload->>'requestId','')::integer; result jsonb; BEGIN
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 uid:=tbs_resolve_employee(payload->>'accountId');
 IF actor.id IS NULL AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND status='active') THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF payload->>'action'='remove' THEN
  DELETE FROM tbs_leave_evidence WHERE id=(payload->>'id')::uuid AND user_id=uid AND request_id IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Only your unattached files can be removed');END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF payload->>'action'='upload' THEN
  IF COALESCE(payload->>'documentType','other') NOT IN ('certificate','bill','activity','other') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid document type'); END IF;
  IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Employee sign-in required'); END IF;
  PERFORM 1 FROM tbs_employees WHERE user_id=uid FOR UPDATE;
  DELETE FROM tbs_leave_evidence WHERE user_id=uid AND request_id IS NULL AND created_at<now()-interval '1 day';
  IF (SELECT count(*) FROM tbs_leave_evidence WHERE user_id=uid AND request_id IS NULL)>=6 THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Too many unattached files. Try again tomorrow.'); END IF;
  IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM leave_requests WHERE id=rid AND user_id=uid AND leave_type='sick' AND status<>'Rejected') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Request not available'); END IF;
  IF rid IS NOT NULL AND (SELECT count(*) FROM tbs_leave_evidence WHERE request_id=rid)>=3 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Up to three attachments per request'); END IF;
  INSERT INTO tbs_leave_evidence(user_id,request_id,filename,mime,content,document_type) VALUES(uid,rid,left(payload->>'filename',150),payload->>'mime',decode(payload->>'content','base64'),COALESCE(payload->>'documentType','other')) RETURNING * INTO item;
  RETURN jsonb_build_object('ok',true,'id',item.id,'filename',item.filename,'documentType',item.document_type);
 END IF;
 IF payload->>'id' IS NOT NULL THEN SELECT * INTO item FROM tbs_leave_evidence WHERE id=(payload->>'id')::uuid;rid:=item.request_id; END IF;
 IF actor.id IS NOT NULL THEN
  IF rid IS NULL OR NOT EXISTS(SELECT 1 FROM leave_requests r JOIN tbs_employees e ON e.user_id=r.user_id WHERE r.id=rid AND (actor.role IN ('admin','ceo') OR e.employment_type='intern')) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Access denied'); END IF;
 ELSE
  IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM leave_requests WHERE id=rid AND user_id=uid) OR item.id IS NOT NULL AND item.user_id<>uid THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Access denied'); END IF;
 END IF;
 IF payload->>'action'='download' AND item.id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'filename',item.filename,'documentType',item.document_type,'mime',item.mime,'content',encode(item.content,'base64')); END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'filename',filename,'createdAt',created_at,'documentType',document_type)),'[]'::jsonb) INTO result FROM tbs_leave_evidence WHERE request_id=rid;
 RETURN jsonb_build_object('ok',true,'files',result);
END $$;

DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_employee_request_before_intern(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'WHERE request_id=(result->>''id'')::integer) THEN','WHERE request_id=(result->>''id'')::integer AND document_type=''certificate'') THEN');
 EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION tbs_evidence_medical_received() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.request_id IS NOT NULL AND NEW.document_type='certificate' THEN
  DELETE FROM tbs_sync_jobs WHERE kind='line' AND (payload->>'medicalRequestId')::integer=NEW.request_id AND completed_generation<generation AND (lease_until IS NULL OR lease_until<now());
 END IF;
 RETURN NEW;
END $$;
COMMIT;
