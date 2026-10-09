BEGIN;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_line_cancellation(text,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'Open this message using the CEO LINE account.','Open this message using the assigned approver’s LINE account.');
 def:=replace(def,'''CEO via verified LINE''','CASE WHEN EXISTS(SELECT 1 FROM tbs_employees WHERE user_id=r.user_id AND employment_type=''intern'') THEN ''HR via verified LINE'' ELSE ''CEO via verified LINE'' END');EXECUTE def;
 SELECT pg_get_functiondef('tbs_leave_result_flex(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'ELSE r->>''leave_type'' END','WHEN ''university'' THEN ''University Activity / กิจกรรมมหาวิทยาลัย'' ELSE r->>''leave_type'' END');EXECUTE def;
END $$;
COMMIT;
