BEGIN;
ALTER TABLE tbs_employees ADD COLUMN IF NOT EXISTS picture_url text;
ALTER TABLE tbs_registrations ADD COLUMN IF NOT EXISTS picture_url text;

DO $$ DECLARE def text; marker text:='PERFORM pg_advisory_xact_lock(hashtext(uid));'; BEGIN
 SELECT pg_get_functiondef('tbs_registration(jsonb)'::regprocedure) INTO def;
 IF position('tbs_save_line_picture' IN def)=0 THEN
  IF position(marker IN def)=0 THEN RAISE EXCEPTION 'tbs_registration marker not found'; END IF;
  def:=replace(def,marker,marker||E'\n PERFORM tbs_save_line_picture(uid,payload->>''pictureUrl'');');
 END IF;
 CREATE OR REPLACE FUNCTION tbs_save_line_picture(uid text,url text) RETURNS void LANGUAGE plpgsql AS $f$
 BEGIN
  IF COALESCE(url,'') !~ '^https://[a-z0-9.-]+\.line-scdn\.net/' OR length(url)>600 THEN RETURN; END IF;
  UPDATE tbs_employees SET picture_url=url WHERE user_id=tbs_resolve_employee(uid) AND picture_url IS DISTINCT FROM url;
  UPDATE tbs_registrations SET picture_url=url WHERE user_id=uid AND picture_url IS DISTINCT FROM url;
 END $f$;
 EXECUTE def;
END $$;

CREATE OR REPLACE FUNCTION tbs_employee_picture_from_registration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.picture_url IS NULL THEN SELECT picture_url INTO NEW.picture_url FROM tbs_registrations WHERE user_id=NEW.user_id; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tbs_employee_picture_from_registration ON tbs_employees;
CREATE TRIGGER tbs_employee_picture_from_registration BEFORE INSERT ON tbs_employees FOR EACH ROW EXECUTE FUNCTION tbs_employee_picture_from_registration();

DO $$ BEGIN
 IF to_regprocedure('tbs_dashboard_auth_before_pictures(jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_dashboard_auth(jsonb) RENAME TO tbs_dashboard_auth_before_pictures;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_dashboard_auth(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:=tbs_dashboard_auth_before_pictures(payload);
BEGIN
 IF payload->>'operation'='data' AND jsonb_typeof(result->'employees')='array' THEN
  result:=jsonb_set(result,'{employees}',COALESCE((SELECT jsonb_agg(CASE WHEN e.picture_url IS NULL THEN x ELSE x||jsonb_build_object('picture_url',e.picture_url) END ORDER BY n)
   FROM jsonb_array_elements(result->'employees') WITH ORDINALITY t(x,n) LEFT JOIN tbs_employees e ON e.user_id=x->>'user_id'),'[]'::jsonb));
 END IF;
 RETURN result;
END $$;
COMMIT;
