BEGIN;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('tbs_intern_decision(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'''days'',r.leave_days,''reason'',r.reason','''days'',r.leave_days,''period'',r.half_day_period,''reason'',r.reason');
 EXECUTE def;
 SELECT pg_get_functiondef('tbs_evidence(jsonb)'::regprocedure) INTO def;
 IF strpos(def,'''File not found''')=0 THEN
 def:=replace(def,'IF payload->>''action''=''remove'' THEN',
 'IF payload->>''action''=''download'' AND NOT EXISTS(SELECT 1 FROM tbs_leave_evidence WHERE id=(payload->>''id'')::uuid) THEN RETURN jsonb_build_object(''ok'',false,''statusCode'',404,''error'',''File not found''); END IF;
 IF payload->>''action''=''remove'' THEN');
 EXECUTE def; END IF;
END $$;
COMMIT;
