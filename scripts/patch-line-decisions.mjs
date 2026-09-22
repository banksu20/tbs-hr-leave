import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function patchLineDecisions(original){
 const w=structuredClone(original);
 const node=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw Error(`Missing LINE node: ${name}`);return n;};
 const edge=node=>({node,type:'main',index:0});
 const route=(source,...targets)=>{node(source);targets.forEach(node);w.connections[source]={main:targets.map(n=>[edge(n)])};};
 for(const [action,source] of [['approve','Prepare Check Data'],['reject','Webhook Reject Form']]){
   const label=action==='approve'?'Approve':'Reject';
   const n=node(`Update DB (${label})`);
   n.parameters={operation:'executeQuery',query:`SELECT result.* FROM jsonb_to_record(tbs_line_decision('${action}',$1::jsonb)) AS result(ok boolean, "statusCode" integer, error text, id integer, reason text, user_name text, leave_type text, leave_days numeric, half_day_period text, selected_dates text, f_start text, f_end text);`,options:{queryReplacement:action==='approve'?`={{ [JSON.stringify({id: $('Prepare Check Data').first().json.db_id, userId: $('Prepare Check Data').first().json.employeeUserId})] }}`:`={{ [JSON.stringify({id: $('Webhook Reject Form').first().json.body.dbId, userId: $('Webhook Reject Form').first().json.body.userId, rejectionReason: $('Webhook Reject Form').first().json.body.reason || ''})] }}`}};
   const name=`LINE ${label} saved?`;
   let guard=w.nodes.find(n=>n.name===name);
   if(!guard){guard={id:randomUUID(),name,type:'n8n-nodes-base.if',typeVersion:2.2,position:[(n.position?.[0]??0)+220,n.position?.[1]??0]};w.nodes.push(guard);}
   guard.parameters={conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:`line-${action}-saved`,leftValue:'={{ $json.ok }}',rightValue:true,operator:{type:'boolean',operation:'equals'}}],combinator:'and'},options:{}};
 }
 route('Prepare Check Data','Update DB (Approve)');
 route('Update DB (Approve)','LINE Approve saved?');
 route('LINE Approve saved?','Prepare Approve Payload','Notify CM (Already Processed)');
 route('Prepare Approve Payload','Get Dept for CM');
 route('Code1','Update DB (Reject)');
 route('Update DB (Reject)','LINE Reject saved?');
 route('LINE Reject saved?','Clear Leave Data','Respond Error (Already Processed)');
 route('Clear Leave Data','Get Current Quota');
 // The legacy spreadsheet status checks are retained for rollback, but cannot execute in either decision path.
 for(const name of ['Check Current Status','Is Awaiting Approval?','Get Status Before Reject','Is Awaiting Approval? (Reject)']){
   node(name).disabled=true;delete w.connections[name];
 }
 const prepare=node('Prepare Approve Payload');
 let code=prepare.parameters.jsCode;
 if(!code.includes("$('Update DB (Approve)').first().json")){
   const old="const statusData = $('Check Current Status').first().json;";
   if(!code.includes(old))throw Error('Approval message formatter changed; review before patching');
   code=code.replace(old,"const decision = $('Update DB (Approve)').first().json;\nconst statusData = {valueRanges:[{values:[[decision.reason || '']]}]};");
   code=code.replace('const totalDays = prepData.totalDays;','const totalDays = Number(decision.leave_days);')
     .replace('const userName = prepData.userName;','const userName = decision.user_name;')
     .replace('const leaveTypeRaw = prepData.leaveType;','const leaveTypeRaw = decision.leave_type;')
     .replace('const halfDayPeriod = prepData.halfDayPeriod || "";','const halfDayPeriod = decision.half_day_period || "";')
     .replace('let displayDate = prepData.leaveDate || "-";','let displayDate = decision.selected_dates || "-";');
 }
 prepare.parameters.jsCode=code;
 // False also covers missing/changed requests or inactive employees: do not claim success.
 node('Notify CM (Already Processed)').parameters.jsonBody="={{ JSON.stringify({to: $('Prepare Check Data').first().json.cmUserId, messages:[{type:'text',text:'ไม่สามารถทำรายการได้ / Decision not saved: ' + ($json.error || 'Refresh the dashboard to review the current request.')} ]}) }}";
 node('Respond Error (Already Processed)').parameters={respondWith:'json',responseBody:"={{ {success:false,message:$json.error || 'Decision not saved. Refresh the request.'} }}",options:{responseCode:409}};
 w.active=false;w.pinData={};delete w.versionId;return w;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/patch-line-decisions.mjs INPUT OUTPUT');
 writeFileSync(output,JSON.stringify(patchLineDecisions(JSON.parse(readFileSync(input,'utf8'))),null,2),{mode:0o600});
}
