BEGIN;
ALTER TABLE tbs_employees ADD COLUMN IF NOT EXISTS career_level text;
ALTER TABLE tbs_employees ADD COLUMN IF NOT EXISTS manager_user_id text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='tbs_employees_career_level_check') THEN
  ALTER TABLE tbs_employees ADD CONSTRAINT tbs_employees_career_level_check CHECK(career_level IN ('operational','manager','c_level'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='tbs_employees_manager_fk') THEN
  ALTER TABLE tbs_employees ADD CONSTRAINT tbs_employees_manager_fk FOREIGN KEY(manager_user_id) REFERENCES tbs_employees(user_id) ON DELETE SET NULL;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS tbs_employee_roles(
 id serial PRIMARY KEY,
 user_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 role text NOT NULL CHECK(length(btrim(role)) BETWEEN 1 AND 80),
 time_share numeric(5,2) NOT NULL CHECK(time_share>0 AND time_share<=100),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,role)
);
CREATE TABLE IF NOT EXISTS tbs_sop_docs(
 id serial PRIMARY KEY,
 title_en text NOT NULL CHECK(length(btrim(title_en)) BETWEEN 1 AND 120),
 title_th text NOT NULL DEFAULT '' CHECK(length(title_th)<=120),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 20000),
 version integer NOT NULL DEFAULT 1,
 sort_order integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
CREATE TABLE IF NOT EXISTS tbs_sop_acks(
 user_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 doc_id integer NOT NULL REFERENCES tbs_sop_docs(id) ON DELETE CASCADE,
 version integer NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,doc_id,version)
);
INSERT INTO tbs_sop_docs(title_en,title_th,body,sort_order,updated_by)
SELECT 'Data rules','กติกาข้อมูล',
'TBS เก็บข้อมูลในระบบ HR เพื่อพัฒนาคน ไม่ใช่จับผิดคน กดยอมรับเอกสารนี้ = ยินยอมให้เก็บและใช้ข้อมูลตามกติกาด้านล่าง'||chr(10)||chr(10)||
'1. เจ้าตัวเห็นผลของตัวเองเสมอ และเห็นก่อนคนอื่น'||chr(10)||
'2. ใครเห็นอะไร เป็นไปตามบทบาท ทีม IT ไม่เห็นคะแนนรายคนผ่านหน้าจอปกติ'||chr(10)||
'3. ผลบุคลิกภาพและผลประเมินใช้พัฒนาคน ไม่ใช้ตัดสินเงินเดือนหรือเลิกจ้าง และไม่มีข้อมูลเงินเดือนในระบบ'||chr(10)||
'4. ระบบอ่านตำแหน่งเฉพาะตอนกดเช็กอินเบิกค่าเดินทาง ไม่ติดตามตลอดทาง'||chr(10)||
'5. ข้อความในไลน์กลุ่มลูกค้าใช้ดูแนวโน้มประกอบการประเมิน นับเฉพาะเวลาทำงาน'||chr(10)||
'6. ขอลบผลบุคลิกภาพได้เมื่อลาออกหรือเมื่อเจ้าตัวขอ ข้อมูลเบิกเงินเก็บตามที่ฝ่ายบัญชีกำหนด'||chr(10)||
'7. มีคำถามเรื่องข้อมูล ติดต่อหัวหน้า People & Culture ได้ทุกเมื่อ',
0,'system'
WHERE NOT EXISTS(SELECT 1 FROM tbs_sop_docs);

CREATE OR REPLACE FUNCTION tbs_sop_employee_list(uid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'titleEn',d.title_en,'titleTh',d.title_th,'body',d.body,'version',d.version,'updatedAt',d.updated_at,
  'acceptedAt',(SELECT accepted_at FROM tbs_sop_acks a WHERE a.user_id=uid AND a.doc_id=d.id AND a.version=d.version),
  'acceptedBefore',EXISTS(SELECT 1 FROM tbs_sop_acks a WHERE a.user_id=uid AND a.doc_id=d.id AND a.version<d.version)) ORDER BY d.sort_order,d.id),'[]'::jsonb)
 FROM tbs_sop_docs d WHERE d.active;
$$;
CREATE OR REPLACE FUNCTION tbs_sop_employee(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text:=tbs_resolve_employee(payload->>'accountId'); d tbs_sop_docs%ROWTYPE; BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Your employee account is not active.');
 END IF;
 IF operation='sop-accept' THEN
  IF COALESCE(payload->>'docId','')!~'^[1-9][0-9]{0,8}$' OR COALESCE(payload->>'version','')!~'^[1-9][0-9]{0,8}$' THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid document.');
  END IF;
  SELECT * INTO d FROM tbs_sop_docs WHERE id=(payload->>'docId')::integer AND active;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Document not found.'); END IF;
  IF d.version<>(payload->>'version')::integer THEN
   RETURN jsonb_build_object('ok',false,'statusCode',409,'error','This document was just updated. Please read the new version.','docs',tbs_sop_employee_list(uid));
  END IF;
  INSERT INTO tbs_sop_acks(user_id,doc_id,version) VALUES(uid,d.id,d.version) ON CONFLICT DO NOTHING;
 END IF;
 RETURN jsonb_build_object('ok',true,'docs',tbs_sop_employee_list(uid));
END $$;

DO $$ BEGIN
 IF to_regprocedure('tbs_cancellation_before_sop(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_cancellation(text,jsonb) RENAME TO tbs_cancellation_before_sop;
 END IF;
 IF to_regprocedure('tbs_dashboard_auth_before_hr_foundation(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_hr_foundation;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF operation IN ('sop-list','sop-accept') THEN RETURN tbs_sop_employee(operation,payload); END IF;
 RETURN tbs_cancellation_before_sop(operation,payload);
END $$;

CREATE OR REPLACE FUNCTION tbs_sop_notice(d tbs_sop_docs,updated boolean) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer; BEGIN
 INSERT INTO tbs_sync_jobs(kind,user_id,payload)
 SELECT 'line',e.user_id,jsonb_build_object('to',e.user_id,'messages',jsonb_build_array(jsonb_build_object('type','flex',
  'altText',left('Company SOP '||CASE WHEN updated THEN 'updated' ELSE 'added' END||' / ระเบียบบริษัท: '||d.title_en,300),
  'contents',jsonb_build_object('type','bubble','body',jsonb_build_object('type','box','layout','vertical','spacing','md','contents',jsonb_build_array(
   jsonb_build_object('type','text','text',CASE WHEN updated THEN 'ระเบียบบริษัทมีการแก้ไข / SOP updated' ELSE 'ระเบียบบริษัทใหม่ / New company SOP' END,'weight','bold','color','#0E7490','size','sm','wrap',true),
   jsonb_build_object('type','text','text',left(COALESCE(NULLIF(d.title_th,''),d.title_en)||CASE WHEN d.title_th<>'' THEN ' · '||d.title_en ELSE '' END,200),'weight','bold','size','lg','wrap',true),
   jsonb_build_object('type','text','text','กรุณาอ่านและกดยอมรับ / Please read and accept.','size','sm','color','#64748B','wrap',true))),
  'footer',jsonb_build_object('type','box','layout','vertical','contents',jsonb_build_array(jsonb_build_object('type','button','style','primary','color','#0891B2',
   'action',jsonb_build_object('type','uri','label','อ่านและยอมรับ / Read','uri','https://liff.line.me/2008617589-89gR1Y3Y/sops'))))))))
 FROM tbs_employees e WHERE COALESCE(e.status,'active')='active' AND e.user_id ~ '^U[0-9a-f]{32}$';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION tbs_line_job_wanted(payload jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT tbs_approval_request_id(payload) IS NOT NULL
  OR COALESCE(payload#>>'{messages,0,altText}','') ~ '^(อนุมัติแล้ว / Approved|ไม่อนุมัติ / Leave rejected|Company SOP (added|updated) / ระเบียบบริษัท)';
$$;

CREATE OR REPLACE FUNCTION tbs_hr_people() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.user_id,'code',CASE WHEN e.employment_type='intern' THEN 'INT-'||lpad(COALESCE(e.intern_number,0)::text,3,'0') ELSE 'TBS-'||lpad(e.tbs_id::text,3,'0') END,
  'name',concat_ws(' ',e.first_name,e.last_name),'nickname',e.nickname,'department',e.department,'type',e.employment_type,
  'careerLevel',e.career_level,'managerId',e.manager_user_id,
  'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',r.role,'timeShare',r.time_share) ORDER BY r.time_share DESC,r.role) FROM tbs_employee_roles r WHERE r.user_id=e.user_id),'[]'::jsonb),
  'sopPending',(SELECT count(*) FROM tbs_sop_docs d WHERE d.active AND NOT EXISTS(SELECT 1 FROM tbs_sop_acks a WHERE a.user_id=e.user_id AND a.doc_id=d.id AND a.version=d.version)))
  ORDER BY e.employment_type,e.tbs_id,e.intern_number),'[]'::jsonb)
 FROM tbs_employees e WHERE COALESCE(e.status,'active')='active';
$$;
CREATE OR REPLACE FUNCTION tbs_hr_sops() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'titleEn',d.title_en,'titleTh',d.title_th,'body',d.body,'version',d.version,'sortOrder',d.sort_order,'active',d.active,'updatedAt',d.updated_at,
  'accepted',(SELECT count(*) FROM tbs_sop_acks a JOIN tbs_employees e ON e.user_id=a.user_id AND COALESCE(e.status,'active')='active' WHERE a.doc_id=d.id AND a.version=d.version),
  'missing',COALESCE((SELECT jsonb_agg(COALESCE(NULLIF(e.nickname,''),e.first_name) ORDER BY e.employment_type,e.tbs_id,e.intern_number) FROM tbs_employees e
   WHERE COALESCE(e.status,'active')='active' AND NOT EXISTS(SELECT 1 FROM tbs_sop_acks a WHERE a.user_id=e.user_id AND a.doc_id=d.id AND a.version=d.version)),'[]'::jsonb))
  ORDER BY d.active DESC,d.sort_order,d.id),'[]'::jsonb)
 FROM tbs_sop_docs d;
$$;

CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; b jsonb:=COALESCE(payload->'body','{}'::jsonb);
 d tbs_sop_docs%ROWTYPE; changed boolean; notified integer:=0; uid text; total numeric; mgr text; BEGIN
 IF op NOT IN ('hr-people','hr-people-save','hr-sops','hr-sop-save','hr-sop-active') THEN RETURN tbs_dashboard_auth_before_hr_foundation(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 IF op='hr-people' THEN RETURN jsonb_build_object('ok',true,'people',tbs_hr_people()); END IF;
 IF op='hr-sops' THEN RETURN jsonb_build_object('ok',true,'sops',tbs_hr_sops()); END IF;
 IF op='hr-people-save' THEN
  uid:=b->>'userId';
  IF NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Employee not found.'); END IF;
  IF COALESCE(b->>'careerLevel','') NOT IN ('','operational','manager','c_level') THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Invalid career level.'); END IF;
  mgr:=NULLIF(b->>'managerId','');
  IF mgr=uid OR (mgr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=mgr AND COALESCE(status,'active')='active')) THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose another manager.'); END IF;
  IF jsonb_typeof(COALESCE(b->'roles','[]'::jsonb))<>'array' OR jsonb_array_length(COALESCE(b->'roles','[]'::jsonb))>8
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(b->'roles','[]'::jsonb)) x WHERE length(btrim(COALESCE(x->>'role','')))NOT BETWEEN 1 AND 80 OR COALESCE(x->>'timeShare','')!~'^[0-9]{1,3}(\.[0-9]{1,2})?$' OR (x->>'timeShare')::numeric<=0)
   OR (SELECT count(DISTINCT lower(btrim(x->>'role')))<>count(*) FROM jsonb_array_elements(COALESCE(b->'roles','[]'::jsonb)) x) THEN
   RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Each role needs a unique name and a time share.');
  END IF;
  SELECT sum((x->>'timeShare')::numeric) INTO total FROM jsonb_array_elements(COALESCE(b->'roles','[]'::jsonb)) x;
  IF total IS NOT NULL AND total<>100 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Role time shares must add up to 100%.'); END IF;
  UPDATE tbs_employees SET career_level=NULLIF(b->>'careerLevel',''),manager_user_id=mgr WHERE user_id=uid;
  DELETE FROM tbs_employee_roles WHERE user_id=uid;
  INSERT INTO tbs_employee_roles(user_id,role,time_share) SELECT uid,btrim(x->>'role'),(x->>'timeShare')::numeric FROM jsonb_array_elements(COALESCE(b->'roles','[]'::jsonb)) x;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'hr-people-save',uid);
  RETURN jsonb_build_object('ok',true,'people',tbs_hr_people());
 END IF;
 IF op='hr-sop-active' THEN
  UPDATE tbs_sop_docs SET active=COALESCE((b->>'active')::boolean,active),updated_at=now(),updated_by=actor.username WHERE id=NULLIF(b->>'id','')::integer RETURNING * INTO d;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Document not found.'); END IF;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,CASE WHEN d.active THEN 'hr-sop-restore' ELSE 'hr-sop-archive' END,d.id::text);
  RETURN jsonb_build_object('ok',true,'sops',tbs_hr_sops());
 END IF;
 IF length(btrim(COALESCE(b->>'titleEn','')))NOT BETWEEN 1 AND 120 OR length(COALESCE(b->>'titleTh',''))>120 OR length(btrim(COALESCE(b->>'body','')))NOT BETWEEN 1 AND 20000 THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Add a title (up to 120 characters) and the document text.');
 END IF;
 IF NULLIF(b->>'id','') IS NULL THEN
  INSERT INTO tbs_sop_docs(title_en,title_th,body,sort_order,updated_by)
   VALUES(btrim(b->>'titleEn'),btrim(COALESCE(b->>'titleTh','')),btrim(b->>'body'),COALESCE((SELECT max(sort_order)+1 FROM tbs_sop_docs),0),actor.username) RETURNING * INTO d;
  changed:=true;
 ELSE
  SELECT * INTO d FROM tbs_sop_docs WHERE id=(b->>'id')::integer FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Document not found.'); END IF;
  IF COALESCE((b->>'version')::integer,-1)<>d.version THEN RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Someone else changed this document. Reload and try again.','sops',tbs_hr_sops()); END IF;
  changed:=d.body IS DISTINCT FROM btrim(b->>'body') OR d.title_en IS DISTINCT FROM btrim(b->>'titleEn') OR d.title_th IS DISTINCT FROM btrim(COALESCE(b->>'titleTh',''));
  UPDATE tbs_sop_docs SET title_en=btrim(b->>'titleEn'),title_th=btrim(COALESCE(b->>'titleTh','')),body=btrim(b->>'body'),
   version=version+CASE WHEN changed THEN 1 ELSE 0 END,updated_at=now(),updated_by=actor.username WHERE id=d.id RETURNING * INTO d;
 END IF;
 IF changed AND d.active AND COALESCE((b->>'notify')::boolean,false) THEN notified:=tbs_sop_notice(d,NULLIF(b->>'id','') IS NOT NULL); END IF;
 INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'hr-sop-save',d.id::text||' v'||d.version);
 RETURN jsonb_build_object('ok',true,'id',d.id,'version',d.version,'notified',notified,'sops',tbs_hr_sops());
END $$;
COMMIT;
