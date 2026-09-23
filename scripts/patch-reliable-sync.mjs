import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {patchDashboardFeatures} from './patch-dashboard-features.mjs';
import {patchLineDecisions} from './patch-line-decisions.mjs';
import {projectSheet} from '../n8n/js/sheet-projection.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function patchReliableSync(original){
 const w=original.nodes.some(n=>n.name==='Deliver saved HR changes') ? patchDashboardFeatures(original) : patchLineDecisions(patchDashboardFeatures(original));
 const node=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw Error(`Missing node ${name}`);return n;};
 const route=(name,...targets)=>{targets.forEach(node);w.connections[name]={main:targets.map(target=>[{node:target,type:'main',index:0}])};};
 const add=(template,name,parameters)=>{let n=w.nodes.find(n=>n.name===name);if(!n){n={...structuredClone(node(template)),id:randomUUID(),name,position:[0,7000+w.nodes.length*30]};delete n.webhookId;delete n.disabled;w.nodes.push(n);}n.parameters=parameters;return n;};
 const sql=name=>readFileSync(resolve(root,'n8n/sql',name),'utf8');
 const condition=name=>add('LINE Approve saved?',name,{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:randomUUID(),leftValue:'={{ $json.ok }}',rightValue:true,operator:{type:'boolean',operation:'equals'}}],combinator:'and'},options:{}});
 // Exact dates are validated and persisted before any spreadsheet or notification side effects.
 node('Save to DB').parameters={operation:'executeQuery',query:"SELECT result FROM (SELECT tbs_employee_request($1::jsonb) AS result) saved;",options:{queryReplacement:"={{ [JSON.stringify({...$('Clean Dates').first().json,approverIds:$('Find Final Approver').first().json.finalApproverIds})] }}"}};
 add('Clean Dates','Unpack saved request',{jsCode:"return {json:$json.result};"});
 condition('Employee request saved?');
 add('Respond Success','Respond submission failure',{respondWith:'json',responseBody:"={{ {status:'error',message:$json.error} }}",options:{responseCode:'={{ $json.statusCode || 422 }}'}});
 route('Is Limit OK?','Find Final Approver','Respond Error (Over Limit)');
 route('Find Final Approver','Save to DB');route('Save to DB','Unpack saved request');route('Unpack saved request','Employee request saved?');route('Employee request saved?','Respond Success','Respond submission failure');
 // Existing sheet connections remain configured, but decisions use an authoritative database queue.
 node('Prepare Check Data').parameters.jsCode=`const event=$input.first().json.body?.events?.[0];
const data=event?.postback?.data || '';const p=Object.fromEntries(data.split('&').filter(Boolean).map(part=>{const i=part.indexOf('=');return [part.slice(0,i),decodeURIComponent(part.slice(i+1))];}));
if(event?.type!=='postback' || p.action!=='approve')return [];
return {db_id:p.db_id,employeeUserId:p.userId,expectedRevision:p.revision,decisionToken:p.token,cmUserId:event?.source?.userId,action:p.action};`;
 node('Update DB (Approve)').parameters.options.queryReplacement="={{ [JSON.stringify({id:$('Prepare Check Data').first().json.db_id,userId:$('Prepare Check Data').first().json.employeeUserId,expectedRevision:$('Prepare Check Data').first().json.expectedRevision,decisionToken:$('Prepare Check Data').first().json.decisionToken})] }}";
 node('Update DB (Reject)').parameters.options.queryReplacement="={{ [JSON.stringify({id:$('Webhook Reject Form').first().json.body.dbId,userId:$('Webhook Reject Form').first().json.body.userId,expectedRevision:$('Webhook Reject Form').first().json.body.expectedRevision,decisionToken:$('Webhook Reject Form').first().json.body.decisionToken,rejectionReason:$('Webhook Reject Form').first().json.body.reason || ''})] }}";
 route('Webhook Reject Form','Update DB (Reject)');route('LINE Reject saved?','Respond Success1','Respond Error (Already Processed)');
 node('Respond Success1').parameters={respondWith:'json',responseBody:JSON.stringify({success:true,message:'Rejection saved. Employee notification is queued.'}),options:{}};
 route('LINE Approve saved?','Prepare Approve Payload','Notify CM (Already Processed)');
 node('Prepare Approve Payload').parameters.jsCode="return {reply_message_cm:'บันทึกการอนุมัติแล้ว / Approval saved. Spreadsheet sync and employee notification are queued.'};";
 route('Get Dept for CM','Notify CM (Success)');route('Notify CM (Success)','Find CM to Notify');
 // Retain the existing manager FYI/email chain, but use the canonical decided request.
 const mappings={userName:'user_name',leaveType:'leave_type',leaveDate:'selected_dates',totalDays:'leave_days',halfDayPeriod:'half_day_period',employeeUserId:'user_id'};
 for(const name of ['Notify CM (Approved FYI)','Notify CEO Email']){
   let serialized=JSON.stringify(node(name).parameters);
   for(const [old,key] of Object.entries(mappings))serialized=serialized.replaceAll(`$('Prepare Check Data').first().json.${old}`,`$('Update DB (Approve)').first().json.${key}`);
   node(name).parameters=JSON.parse(serialized);
 }
 node('Notify CEO Email').parameters.message=node('Notify CEO Email').parameters.message.replace(/\{\{ \(\$\('Check Current Status'\)[\s\S]*?\}\}/,"{{ $('Update DB (Approve)').first().json.reason || 'Not specified' }}");
 node('Find CM to Notify').parameters.jsCode=node('Find CM to Notify').parameters.jsCode.replace("const prepData = $('Prepare Check Data').first().json;","const request=$('Update DB (Approve)').first().json; const prepData={...$('Prepare Check Data').first().json,leaveType:request.leave_type};");
 // The worker retries persisted jobs. A normal successful decision never depends on an external response.
 let schedule=w.nodes.find(n=>n.name==='Deliver saved HR changes');
 if(!schedule){schedule={id:randomUUID(),name:'Deliver saved HR changes',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,6400],parameters:{rule:{interval:[{field:'minutes',minutesInterval:1}]}}};w.nodes.push(schedule);}
 add('Get all leaves','Claim sheet sync',{operation:'executeQuery',query:sql('sync-sheet-snapshot.sql'),options:{}});
 const sheetUrl=node('Read CEO Sheet').parameters.url;
 if(!sheetUrl.includes('/values/'))throw Error('Unexpected spreadsheet URL');
 const base=sheetUrl.split('/values/')[0];
 const read=add('Read CEO Sheet','Read sync sheet',{...node('Read CEO Sheet').parameters,url:`={{ '${base}/values/' + encodeURIComponent($json.snapshot.sheetName || ('Leave report '+$json.year)) }}`,options:{timeout:30000}});read.onError='continueRegularOutput';
 add('Clean Dates','Project current sheet',{jsCode:`${projectSheet.toString()}\nconst job=$('Claim sheet sync').first().json;try {if($json.error)throw Error('Cannot read target year sheet; check the tab and credentials.');return {ok:true,body:projectSheet(job.snapshot,$json.values||[])};}catch(error){return {ok:false,error:error.message};}`});
 condition('Sheet projection ready?');
 const write=add('Batch Update CEO Sheet','Write current sheet',{...node('Batch Update CEO Sheet').parameters,jsonBody:'={{ JSON.stringify($json.body) }}',options:{timeout:30000,response:{response:{fullResponse:true,neverError:true}}}});write.onError='continueRegularOutput';
 add('Get all leaves','Finish sheet sync',{operation:'executeQuery',query:'SELECT tbs_finish_sync($1::uuid,$2::uuid,$3::bigint,$4::text) AS saved;',options:{queryReplacement:"={{ [$('Claim sheet sync').first().json.id,$('Claim sheet sync').first().json.lease_token,$('Claim sheet sync').first().json.generation,$json.statusCode>=200 && $json.statusCode<300 ? null : ($json.error || 'Sheet sync failed; check the workflow execution')] }}"}});
 add('Get all leaves','Claim LINE delivery',{operation:'executeQuery',query:"SELECT * FROM tbs_claim_sync('line');",options:{}});
 const send=add('Notify Employee (Approved)','Send queued LINE message',{method:'POST',url:"={{ Array.isArray($json.payload.to) ? 'https://api.line.me/v2/bot/message/multicast' : 'https://api.line.me/v2/bot/message/push' }}",authentication:'predefinedCredentialType',nodeCredentialType:'lineMessagingApi',sendHeaders:true,headerParameters:{parameters:[{name:'X-Line-Retry-Key',value:'={{ $json.id }}'}]},sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.payload) }}',options:{timeout:30000,response:{response:{fullResponse:true,neverError:true}}}});send.onError='continueRegularOutput';
 add('Get all leaves','Finish LINE delivery',{operation:'executeQuery',query:'SELECT tbs_finish_sync($1::uuid,$2::uuid,$3::bigint,$4::text) AS saved;',options:{queryReplacement:"={{ [$('Claim LINE delivery').first().json.id,$('Claim LINE delivery').first().json.lease_token,$('Claim LINE delivery').first().json.generation,($json.statusCode>=200 && $json.statusCode<300) || ($json.statusCode===409 && $json.headers?.['x-line-accepted-request-id']) ? null : 'LINE delivery failed; check the workflow execution'] }}"}});
 w.connections[schedule.name]={main:[[{node:'Claim sheet sync',type:'main',index:0},{node:'Claim LINE delivery',type:'main',index:0}]]};
 route('Claim sheet sync','Read sync sheet');route('Read sync sheet','Project current sheet');route('Project current sheet','Sheet projection ready?');route('Sheet projection ready?','Write current sheet','Finish sheet sync');route('Write current sheet','Finish sheet sync');
 route('Claim LINE delivery','Send queued LINE message');route('Send queued LINE message','Finish LINE delivery');
 for(const name of ['Read CEO Sheet','Calculate Math & Grid','If CEO User Found','Batch Update CEO Sheet','LeaveRequest to CM','Update Status to Approved','Clear Leave Data','Get Current Quota','Code1','Code2','Update New Quota','Notify Employee via LINE','Notify Employee (Approved)']){node(name).disabled=true;delete w.connections[name];}
 // Keep employee history and calendar sheet reads, choosing the year from the request instead of 2026.
 for(const name of ['Read CEO Sheet (History)','Read CEO Sheet (Cal)']){
   const n=node(name);const trigger=name.includes('History')?'Webhook get history':'Webhook Get Calendar';
   n.parameters.url=`={{ '${base}/values/' + encodeURIComponent('Leave report '+(/^[0-9]{4}$/.test(String($('${trigger}').first().json.query?.year || '')) ? $('${trigger}').first().json.query.year : $now.setZone('Asia/Bangkok').year)) }}`;
 }
 return w;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [input,output]=process.argv.slice(2);writeFileSync(output,JSON.stringify(patchReliableSync(JSON.parse(readFileSync(input,'utf8'))),null,2),{mode:0o600});}
