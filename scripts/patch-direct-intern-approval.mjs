export function patchDirectInternApproval(original){
 const w=structuredClone(original);const node=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw Error('Missing node '+name);return n;};
 const db=node('Update DB (Approve)');
 db.parameters.query='SELECT result.* FROM jsonb_to_record(tbs_line_decision(\'approve\',$1::jsonb)) AS result(ok boolean, "isolatedTest" boolean, "statusCode" integer, error text, id integer, reason text, user_name text, leave_type text, leave_days numeric, half_day_period text, selected_dates text, f_start text, f_end text);';
 db.parameters.options.queryReplacement="={{ [JSON.stringify({id:$('Prepare Check Data').first().json.db_id,userId:$('Prepare Check Data').first().json.employeeUserId,expectedRevision:$('Prepare Check Data').first().json.expectedRevision,decisionToken:$('Prepare Check Data').first().json.decisionToken,accountId:$('Prepare Check Data').first().json.cmUserId})] }}";
 node('Prepare Approve Payload').parameters.jsCode="return {reply_message_cm:$('Update DB (Approve)').first().json.isolatedTest ? 'Test approved. No real leave, quota or calendar was changed.' : 'บันทึกการอนุมัติแล้ว / Approval saved.'};";
 node('Get Dept for CM').parameters.query="SELECT (SELECT department FROM leave_requests WHERE id=$1) AS department;";
 const cm=node('Find CM to Notify');if(!cm.parameters.jsCode.startsWith("if ($('Update DB (Approve)"))cm.parameters.jsCode="if ($('Update DB (Approve)').first().json.isolatedTest) return [];\n"+cm.parameters.jsCode;
 const check=node('Check Message');for(const c of check.parameters.conditions.conditions){c.leftValue=c.leftValue.replace('.message.text','.message?.text').replace('.postback.data','.postback?.data');}
 return w;
}
