BEGIN;
CREATE TABLE IF NOT EXISTS tbs_travel_payee(
 user_id text PRIMARY KEY REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 name_th text NOT NULL CHECK(length(btrim(name_th)) BETWEEN 2 AND 120),
 name_en text NOT NULL CHECK(length(btrim(name_en)) BETWEEN 2 AND 120),
 position text NOT NULL CHECK(length(btrim(position)) BETWEEN 2 AND 120),
 id_no text NOT NULL CHECK(id_no ~ '^[0-9]{13}$'),
 bank text NOT NULL CHECK(length(btrim(bank)) BETWEEN 2 AND 80),
 account text NOT NULL CHECK(account ~ '^[0-9]{10,15}$'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
CREATE TABLE IF NOT EXISTS tbs_travel_forms(
 user_id text NOT NULL REFERENCES tbs_employees(user_id) ON DELETE CASCADE,
 month date NOT NULL,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND length(data::text)<=40000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text,
 PRIMARY KEY(user_id,month)
);

CREATE OR REPLACE FUNCTION tbs_travel_payee_json(uid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('nameTh',p.name_th,'nameEn',p.name_en,'position',p.position,'idNo',p.id_no,'bank',p.bank,'account',p.account,'updatedAt',p.updated_at)
 FROM tbs_travel_payee p WHERE p.user_id=uid;
$$;
CREATE OR REPLACE FUNCTION tbs_travel_payee_save(uid text,v jsonb,actor text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE id_no text:=regexp_replace(COALESCE(v->>'idNo',''),'[^0-9]','','g'); acct text:=regexp_replace(COALESCE(v->>'account',''),'[^0-9]','','g'); BEGIN
 IF length(btrim(COALESCE(v->>'nameTh',''))) NOT BETWEEN 2 AND 120 OR length(btrim(COALESCE(v->>'nameEn',''))) NOT BETWEEN 2 AND 120 THEN
  RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Enter your name in Thai and English.');
 END IF;
 IF length(btrim(COALESCE(v->>'position',''))) NOT BETWEEN 2 AND 120 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Enter your position.'); END IF;
 IF id_no!~'^[0-9]{13}$' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','The ID card number must have 13 digits.'); END IF;
 IF length(btrim(COALESCE(v->>'bank',''))) NOT BETWEEN 2 AND 80 THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose your bank.'); END IF;
 IF acct!~'^[0-9]{10,15}$' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','The bank account number must have 10 to 15 digits.'); END IF;
 INSERT INTO tbs_travel_payee(user_id,name_th,name_en,position,id_no,bank,account,updated_by)
  VALUES(uid,btrim(v->>'nameTh'),btrim(v->>'nameEn'),btrim(v->>'position'),id_no,btrim(v->>'bank'),acct,actor)
  ON CONFLICT(user_id) DO UPDATE SET name_th=EXCLUDED.name_th,name_en=EXCLUDED.name_en,position=EXCLUDED.position,id_no=EXCLUDED.id_no,
   bank=EXCLUDED.bank,account=EXCLUDED.account,updated_at=now(),updated_by=EXCLUDED.updated_by;
 RETURN jsonb_build_object('ok',true);
END $$;

DO $$ BEGIN
 IF to_regprocedure('tbs_travel_state_before_form(text)') IS NULL THEN
  ALTER FUNCTION tbs_travel_state(text) RENAME TO tbs_travel_state_before_form;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_travel_state(uid text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT tbs_travel_state_before_form(uid)||jsonb_build_object('payee',tbs_travel_payee_json(uid));
$$;

CREATE OR REPLACE FUNCTION tbs_travel_form_kind(k text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE k WHEN 'toll' THEN 'ค่าทางด่วน / Toll' WHEN 'parking' THEN 'ค่าจอดรถ / Parking' WHEN 'grab' THEN 'ค่า Grab' WHEN 'taxi' THEN 'ค่าแท็กซี่ / Taxi' ELSE 'ค่าใช้จ่ายอื่น / Other' END;
$$;
CREATE OR REPLACE FUNCTION tbs_travel_form_default(uid text,m date) RETURNS jsonb LANGUAGE sql STABLE AS $$
 WITH t AS (
  SELECT x.*,tbs_trip_json(x,false) j FROM tbs_trips x
  WHERE x.user_id=uid AND x.trip_date>=m AND x.trip_date<(m+interval '1 month')::date AND x.status IN ('submitted','approved','paid')
 ),r AS (
  SELECT r.*,t.trip_date,row_number() OVER (ORDER BY t.trip_date,t.id,r.created_at) n FROM tbs_trip_receipts r JOIN t ON t.id=r.trip_id
 ),lines AS (
  SELECT t.trip_date d,t.id trip,0 ord,
   'ค่าเดินทาง '||CASE t.mode WHEN 'motorcycle' THEN 'มอเตอร์ไซค์' ELSE 'รถยนต์' END||' '||trim(to_char((t.j->>'km')::numeric,'FM999990.0'))||' กม. · '||COALESCE((SELECT string_agg(s.client_name,', ' ORDER BY s.seq) FROM tbs_trip_stops s WHERE s.trip_id=t.id),'') detail,
   (t.j->>'kmAmount')::numeric amount,''::text remark
  FROM t WHERE (t.j->>'kmAmount')::numeric>0
  UNION ALL
  SELECT r.trip_date,r.trip_id,r.n,tbs_travel_form_kind(r.kind)||COALESCE(' · '||NULLIF(btrim(r.read_merchant),''),''),r.amount,'หลักฐาน #'||r.n
  FROM r
 ),p AS (SELECT * FROM tbs_travel_payee WHERE user_id=uid),e AS (SELECT * FROM tbs_employees WHERE user_id=uid)
 SELECT jsonb_build_object(
  'formDate',tbs_bkk_today(),
  'nameTh',COALESCE((SELECT name_th FROM p),(SELECT btrim(concat_ws(' ',first_name,last_name)) FROM e)),
  'nameEn',COALESCE((SELECT name_en FROM p),''),
  'idNo',COALESCE((SELECT id_no FROM p),''),
  'position',COALESCE((SELECT position FROM p),''),
  'department',COALESCE((SELECT department FROM e),''),
  'bank',COALESCE((SELECT bank FROM p),''),
  'account',COALESCE((SELECT account FROM p),''),
  'approver','',
  'from',(SELECT min(trip_date) FROM t),
  'to',(SELECT max(trip_date) FROM t),
  'rows',(SELECT COALESCE(jsonb_agg(jsonb_build_object('date',l.d,'detail',l.detail,'amount',l.amount,'remark',l.remark) ORDER BY l.d,l.trip,l.ord),'[]'::jsonb) FROM lines l));
$$;
CREATE OR REPLACE FUNCTION tbs_travel_form_evidence(uid text,m date) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('n',n,'id',id,'mime',mime,'kind',kind,'date',trip_date,'amount',amount,'merchant',read_merchant,'tripId',trip_id,
  'needsOriginal',needs_original,'originalReceivedAt',original_received_at) ORDER BY n),'[]'::jsonb)
 FROM (SELECT r.*,x.trip_date,row_number() OVER (ORDER BY x.trip_date,x.id,r.created_at) n FROM tbs_trip_receipts r JOIN tbs_trips x ON x.id=r.trip_id
  WHERE x.user_id=uid AND x.trip_date>=m AND x.trip_date<(m+interval '1 month')::date AND x.status IN ('submitted','approved','paid')) z;
$$;
CREATE OR REPLACE FUNCTION tbs_travel_form_clean(v jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object(
  'formDate',CASE WHEN COALESCE(v->>'formDate','')~'^\d{4}-\d{2}-\d{2}$' THEN v->>'formDate' END,
  'nameTh',left(COALESCE(v->>'nameTh',''),120),'nameEn',left(COALESCE(v->>'nameEn',''),120),
  'idNo',left(COALESCE(v->>'idNo',''),20),'position',left(COALESCE(v->>'position',''),120),'department',left(COALESCE(v->>'department',''),80),
  'bank',left(COALESCE(v->>'bank',''),80),'account',left(COALESCE(v->>'account',''),30),'approver',left(COALESCE(v->>'approver',''),120),
  'from',CASE WHEN COALESCE(v->>'from','')~'^\d{4}-\d{2}-\d{2}$' THEN v->>'from' END,
  'to',CASE WHEN COALESCE(v->>'to','')~'^\d{4}-\d{2}-\d{2}$' THEN v->>'to' END,
  'rows',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date',CASE WHEN COALESCE(x->>'date','')~'^\d{4}-\d{2}-\d{2}$' THEN x->>'date' END,
    'detail',left(COALESCE(x->>'detail',''),200),
    'amount',CASE WHEN COALESCE(x->>'amount','')~'^-?[0-9]{1,7}(\.[0-9]{1,2})?$' THEN (x->>'amount')::numeric END,
    'remark',left(COALESCE(x->>'remark',''),120)) ORDER BY o),'[]'::jsonb)
   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v->'rows')='array' THEN v->'rows' ELSE '[]'::jsonb END) WITH ORDINALITY a(x,o) WHERE o<=60));
$$;
CREATE OR REPLACE FUNCTION tbs_travel_form_admin(op text,b jsonb,actor tbs_dashboard_accounts) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE m date:=tbs_travel_payout_month(b->>'month'); uid text:=b->>'userId'; d jsonb; e tbs_employees%ROWTYPE; BEGIN
 IF actor.role NOT IN ('admin','ceo','hr','accounting') THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Operation not permitted'); END IF;
 IF m IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Choose a month.'); END IF;
 SELECT * INTO e FROM tbs_employees WHERE user_id=uid;
 IF e.user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',404,'error','Employee not found.'); END IF;
 IF op='travel-form-save' THEN
  IF jsonb_typeof(b->'data')<>'object' THEN RETURN jsonb_build_object('ok',false,'statusCode',422,'error','Check the details and try again.'); END IF;
  d:=tbs_travel_form_clean(b->'data');
  INSERT INTO tbs_travel_forms(user_id,month,data,updated_by) VALUES(uid,m,d,actor.username)
   ON CONFLICT(user_id,month) DO UPDATE SET data=EXCLUDED.data,updated_at=now(),updated_by=EXCLUDED.updated_by;
  IF (d->>'idNo')~'^[0-9]{13}$' AND (d->>'account')~'^[0-9]{10,15}$' AND length(btrim(d->>'nameTh'))>=2 AND length(btrim(d->>'nameEn'))>=2 AND length(btrim(d->>'position'))>=2 AND length(btrim(d->>'bank'))>=2 THEN
   PERFORM tbs_travel_payee_save(uid,d,actor.username);
  END IF;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'travel-form-save',uid||' '||to_char(m,'YYYY-MM'));
 ELSIF op='travel-form-reset' THEN
  DELETE FROM tbs_travel_forms WHERE user_id=uid AND month=m;
  INSERT INTO tbs_dashboard_account_audit(actor_id,action,target) VALUES(actor.id,'travel-form-reset',uid||' '||to_char(m,'YYYY-MM'));
 END IF;
 RETURN jsonb_build_object('ok',true,'month',to_char(m,'YYYY-MM'),'userId',uid,
  'code',CASE WHEN e.employment_type='intern' THEN 'INT-'||lpad(COALESCE(e.intern_number,0)::text,3,'0') ELSE 'TBS-'||lpad(COALESCE(e.tbs_id,0)::text,3,'0') END,
  'saved',(SELECT jsonb_build_object('updatedAt',f.updated_at,'updatedBy',f.updated_by) FROM tbs_travel_forms f WHERE f.user_id=uid AND f.month=m),
  'form',COALESCE((SELECT f.data FROM tbs_travel_forms f WHERE f.user_id=uid AND f.month=m),tbs_travel_form_default(uid,m)),
  'evidence',tbs_travel_form_evidence(uid,m),
  'payeeMissing',NOT EXISTS(SELECT 1 FROM tbs_travel_payee WHERE user_id=uid));
END $$;

DO $$ BEGIN
 IF to_regprocedure('tbs_cancellation_before_travel_form(text,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_cancellation(text,jsonb) RENAME TO tbs_cancellation_before_travel_form;
 END IF;
 IF to_regprocedure('tbs_dashboard_auth_before_travel_form(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_travel_form;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_cancellation(operation text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid text; r jsonb; BEGIN
 IF operation NOT IN ('travel-payee-save','travel-start') THEN RETURN tbs_cancellation_before_travel_form(operation,payload); END IF;
 uid:=tbs_resolve_employee(payload->>'accountId');
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=uid AND COALESCE(status,'active')='active') THEN
  RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Your employee account is not active.');
 END IF;
 IF operation='travel-start' THEN
  IF tbs_travel_eligible(uid) AND NOT EXISTS(SELECT 1 FROM tbs_travel_payee WHERE user_id=uid) THEN
   RETURN jsonb_build_object('ok',false,'statusCode',409,'error','Add your payment details first.');
  END IF;
  RETURN tbs_cancellation_before_travel_form(operation,payload);
 END IF;
 IF NOT tbs_travel_eligible(uid) THEN RETURN jsonb_build_object('ok',false,'statusCode',403,'error','Travel claims are not open for your account yet.'); END IF;
 r:=tbs_travel_payee_save(uid,payload,'employee');
 IF NOT (r->>'ok')::boolean THEN RETURN r; END IF;
 RETURN tbs_travel_state(uid);
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor tbs_dashboard_accounts%ROWTYPE; op text:=payload->>'operation'; BEGIN
 IF op NOT IN ('travel-form','travel-form-save','travel-form-reset') THEN RETURN tbs_dashboard_auth_before_travel_form(payload); END IF;
 SELECT * INTO actor FROM tbs_dashboard_actor(payload->>'sessionHash');
 IF actor.id IS NULL THEN RETURN jsonb_build_object('ok',false,'statusCode',401,'error','Sign in required'); END IF;
 RETURN tbs_travel_form_admin(op,COALESCE(payload->'body','{}'::jsonb),actor);
END $$;
COMMIT;
