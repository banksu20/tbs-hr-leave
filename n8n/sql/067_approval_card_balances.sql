BEGIN;
CREATE OR REPLACE FUNCTION tbs_request_balance_line(request leave_requests) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE kind text; balance jsonb; amount text; parts text[]:='{}'; BEGIN
 FOREACH kind IN ARRAY ARRAY['sick','annual','personal'] LOOP
  balance:=tbs_leave_balance(request.user_id,extract(year FROM request.start_date::date)::integer,kind);
  CONTINUE WHEN balance IS NULL OR COALESCE((balance->>'unlimited')::boolean,false) OR NOT COALESCE((balance->>'known')::boolean,false) OR balance->>'total' IS NULL;
  amount:=balance->>'available';
  IF amount ~ '\.' THEN amount:=regexp_replace(amount,'\.?0+$',''); END IF;
  parts:=parts||((CASE kind WHEN 'sick' THEN 'ลาป่วย Sick' WHEN 'annual' THEN 'ลาพักร้อน Annual' ELSE 'ลากิจ Personal' END)||' '||amount||'/'||(balance->>'total'));
 END LOOP;
 IF cardinality(parts)=0 THEN RETURN NULL; END IF;
 RETURN 'คงเหลือหลังคำขอนี้ / Left after this request: '||array_to_string(parts,' · ');
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
DO $$ BEGIN
 IF to_regprocedure('tbs_approval_message_before_balance(leave_requests,jsonb)') IS NULL THEN
  ALTER FUNCTION tbs_approval_message(leave_requests,jsonb) RENAME TO tbs_approval_message_before_balance;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION tbs_approval_message(request leave_requests,approvers jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE message jsonb; line text; BEGIN
 message:=tbs_approval_message_before_balance(request,approvers);
 line:=tbs_request_balance_line(request);
 IF line IS NULL THEN RETURN message; END IF;
 RETURN jsonb_insert(message,'{messages,0,contents,body,contents,-1}',jsonb_build_object('type','text','text',line,'size','sm','color','#475569','wrap',true),true);
END $$;
COMMIT;
