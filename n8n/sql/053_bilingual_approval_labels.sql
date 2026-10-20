-- Presentation only: preserve recipients, decision tokens, URLs and actions.
BEGIN;
DO $$ DECLARE def text; fn text; BEGIN
 SELECT pg_get_functiondef('tbs_approval_message_before_intern(leave_requests,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'''NEW LEAVE REQUEST''','''คำขอลาใหม่ / New leave request''');
 def:=replace(def,'''No reason supplied''','''ไม่ได้ระบุเหตุผล / No reason provided''');
 def:=replace(def,$old$request.leave_type||' · '||request.leave_days||' day(s)'||COALESCE(' · '||request.half_day_period,'')$old$,$label$(CASE request.leave_type WHEN 'university' THEN 'กิจกรรมมหาวิทยาลัย / University activities' WHEN 'sick' THEN 'ลาป่วย / Sick' WHEN 'personal' THEN 'ลากิจ / Personal' WHEN 'annual' THEN 'ลาพักร้อน / Annual' WHEN 'vacation' THEN 'ลาพักร้อน / Annual' ELSE request.leave_type END)||' · '||request.leave_days||' วัน / days'||CASE request.half_day_period WHEN 'morning' THEN ' · ช่วงเช้า / Morning' WHEN 'afternoon' THEN ' · ช่วงบ่าย / Afternoon' ELSE '' END$label$);
 -- Match SQL string literals rather than modifying routing/action values.
 def:=replace(def,'''label'', ''Approve''','''label'', ''อนุมัติ / Approve''');
 def:=replace(def,'''label'',''Approve''','''label'',''อนุมัติ / Approve''');
 def:=replace(def,'''label'',''Reject''','''label'',''ปฏิเสธ / Reject''');
 EXECUTE def;
 SELECT pg_get_functiondef('tbs_intern_action_buttons(integer,text,text,text)'::regprocedure) INTO def;
 def:=replace(def,'''label'',''Approve''','''label'',''อนุมัติ / Approve''');
 def:=replace(def,'''label'',''Reject''','''label'',''ปฏิเสธ / Reject''');
 EXECUTE def;
 FOREACH fn IN ARRAY ARRAY['tbs_leave_result_flex(jsonb)'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(fn)) INTO def;
  IF strpos(def,'WHEN ''university''')=0 THEN
  def:=replace(def,'WHEN ''sick'' THEN ''Sick / ลาป่วย''', 'WHEN ''university'' THEN ''University activities / กิจกรรมมหาวิทยาลัย'' WHEN ''sick'' THEN ''Sick / ลาป่วย''');
  EXECUTE def; END IF;
 END LOOP;
END $$;
COMMIT;
