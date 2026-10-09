import {readFileSync} from 'node:fs';
// Apply migrations 021–032 in order (023 already live) before publishing this patch. It does not activate notices.
export function patchLeavePolicy(original) {
 const w=structuredClone(original);
 const endpoint=w.nodes.find(n=>n.name==='Employee cancellations');
 if(!endpoint?.parameters?.query?.includes('SELECT CASE'))throw Error('Expected cancellation dispatcher');
 if(!endpoint.parameters.query.includes("'leave-policy'"))endpoint.parameters.query=endpoint.parameters.query.replace('SELECT CASE',"SELECT CASE WHEN $1::text='leave-policy' THEN tbs_leave_policy_preview($2::jsonb)");
 for(const [op,fn] of [['company-calendar','tbs_company_calendar'],['intern-decision','tbs_intern_decision'],['registration','tbs_registration'],['employee-submit','tbs_employee_request'],['evidence','tbs_evidence'],['intern-terms','tbs_policy_admin']]){
  if(!endpoint.parameters.query.includes(`'${op}'`))endpoint.parameters.query=endpoint.parameters.query.replace('SELECT CASE',`SELECT CASE WHEN $1::text='${op}' THEN ${fn}($2::jsonb)`);
 }
 for(const name of ['Register User API','Main Webhook']){const node=w.nodes.find(n=>n.name===name);if(!node)throw Error('Missing legacy registration/submission webhook');node.disabled=true;}
 const quota=w.nodes.find(n=>n.name==='Get quota');if(!quota)throw Error('Expected quota reader');
 quota.parameters.query=readFileSync(new URL('../n8n/sql/get-quota-policy.sql',import.meta.url),'utf8');
 const sender=w.nodes.find(n=>n.name==='Send queued LINE message');
 if(sender)sender.parameters.jsonBody='={{ JSON.stringify(Object.fromEntries(Object.entries($json.payload).filter(([key]) => key !== "medicalRequestId"))) }}';
 return w;
}
