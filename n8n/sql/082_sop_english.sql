BEGIN;
ALTER TABLE tbs_sop_docs ADD COLUMN IF NOT EXISTS body_en text NOT NULL DEFAULT '';
ALTER TABLE tbs_sop_docs DROP CONSTRAINT IF EXISTS tbs_sop_docs_body_en_check;
ALTER TABLE tbs_sop_docs ADD CONSTRAINT tbs_sop_docs_body_en_check CHECK(length(body_en)<=20000);

CREATE OR REPLACE FUNCTION tbs_sop_employee_list(uid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'titleEn',d.title_en,'titleTh',d.title_th,'body',d.body,'bodyEn',d.body_en,'version',d.version,'updatedAt',d.updated_at,
  'acceptedAt',(SELECT accepted_at FROM tbs_sop_acks a WHERE a.user_id=uid AND a.doc_id=d.id AND a.version=d.version),
  'acceptedBefore',EXISTS(SELECT 1 FROM tbs_sop_acks a WHERE a.user_id=uid AND a.doc_id=d.id AND a.version<d.version)) ORDER BY d.sort_order,d.id),'[]'::jsonb)
 FROM tbs_sop_docs d WHERE d.active;
$$;

CREATE OR REPLACE FUNCTION tbs_hr_sops() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'titleEn',d.title_en,'titleTh',d.title_th,'body',d.body,'bodyEn',d.body_en,'version',d.version,'sortOrder',d.sort_order,'active',d.active,'updatedAt',d.updated_at,
  'accepted',(SELECT count(*) FROM tbs_sop_acks a JOIN tbs_employees e ON e.user_id=a.user_id AND COALESCE(e.status,'active')='active' WHERE a.doc_id=d.id AND a.version=d.version),
  'missing',COALESCE((SELECT jsonb_agg(COALESCE(NULLIF(e.nickname,''),e.first_name) ORDER BY e.employment_type,e.tbs_id,e.intern_number) FROM tbs_employees e
   WHERE COALESCE(e.status,'active')='active' AND NOT EXISTS(SELECT 1 FROM tbs_sop_acks a WHERE a.user_id=e.user_id AND a.doc_id=d.id AND a.version=d.version)),'[]'::jsonb))
  ORDER BY d.active DESC,d.sort_order,d.id),'[]'::jsonb)
 FROM tbs_sop_docs d;
$$;

DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_sop_english(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_sop_english;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; b jsonb:=COALESCE(payload->'body','{}'::jsonb);
 d tbs_sop_docs%ROWTYPE; changed boolean; notified integer:=0; BEGIN
 IF op IS DISTINCT FROM 'hr-sop-save' THEN RETURN tbs_dashboard_auth_before_sop_english(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF actor.role='accounting' THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Accounting can only open travel claims.'); END IF;
 IF length(btrim(COALESCE(b->>'titleEn','')))NOT BETWEEN 1 AND 120 OR length(COALESCE(b->>'titleTh',''))>120 OR length(btrim(COALESCE(b->>'body','')))NOT BETWEEN 1 AND 20000 OR length(COALESCE(b->>'bodyEn',''))>20000 THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Add a title (up to 120 characters) and the document text.');
 END IF;
 IF NULLIF(b->>'id','') IS NULL THEN
  INSERT INTO tbs_sop_docs(title_en,title_th,body,body_en,sort_order,updated_by)
   VALUES(btrim(b->>'titleEn'),btrim(COALESCE(b->>'titleTh','')),btrim(b->>'body'),btrim(COALESCE(b->>'bodyEn','')),COALESCE((SELECT max(sort_order)+1 FROM tbs_sop_docs),0),actor.username) RETURNING * INTO d;
  changed:=true;
 ELSE
  SELECT * INTO d FROM tbs_sop_docs WHERE id=(b->>'id')::integer FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Document not found.'); END IF;
  IF COALESCE((b->>'version')::integer,-1)<>d.version THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Someone else changed this document. Reload and try again.','sops',tbs_hr_sops()); END IF;
  changed:=d.body IS DISTINCT FROM btrim(b->>'body') OR d.body_en IS DISTINCT FROM btrim(COALESCE(b->>'bodyEn','')) OR d.title_en IS DISTINCT FROM btrim(b->>'titleEn') OR d.title_th IS DISTINCT FROM btrim(COALESCE(b->>'titleTh',''));
  UPDATE tbs_sop_docs SET title_en=btrim(b->>'titleEn'),title_th=btrim(COALESCE(b->>'titleTh','')),body=btrim(b->>'body'),body_en=btrim(COALESCE(b->>'bodyEn','')),
   version=version+CASE WHEN changed THEN 1 ELSE 0 END,updated_at=now(),updated_by=actor.username WHERE id=d.id RETURNING * INTO d;
 END IF;
 IF changed AND d.active AND COALESCE((b->>'notify')::boolean,false) THEN notified:=tbs_sop_notice(d,NULLIF(b->>'id','') IS NOT NULL); END IF;
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'hr-sop-save',d.id::text||' v'||d.version);
 RETURN jsonb_build_object('ok',true,'id',d.id,'version',d.version,'notified',notified,'sops',tbs_hr_sops());
END $$;
COMMIT;
