import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function patchDashboardFeatures(original) {
  const w=structuredClone(original);
  const node=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw Error(`Missing node: ${name}`);return n;};
  for(const operation of ['create','update','delete']) {
    const n=node(`dashboard-leave-${operation}`);
    n.parameters.query=`SELECT result.* FROM jsonb_to_record(tbs_dashboard_request_v2(${operation==='update'?"CASE WHEN $1::jsonb->>'action' IN ('restore','approve','reject') THEN $1::jsonb->>'action' ELSE 'update' END":`'${operation}'`}, $1::jsonb)) AS result(ok boolean, id integer, "statusCode" integer, error text);`;
    n.parameters.options={...n.parameters.options,queryReplacement:'={{ [JSON.stringify($json.body)] }}'};
  }
  const baseY=Math.max(0,...w.nodes.map(n=>n.position?.[1]??0))+400;
  const add=(template,name,parameters)=>{
    let n=w.nodes.find(n=>n.name===name);
    if(!n){n={...structuredClone(node(template)),id:randomUUID(),name,position:[name.startsWith('Webhook')?0:name.startsWith('Respond')?640:320,baseY+(name.includes('rollover')?300:0)]};delete n.webhookId;w.nodes.push(n);}
    n.parameters=parameters;return n;
  };
  const webhook=add('Webhook get all leaves','Webhook dashboard-history',{
    httpMethod:'GET',path:'dashboard-history',authentication:'headerAuth',responseMode:'responseNode',options:{}
  });
  webhook.credentials=structuredClone(node('Webhook get all leaves').credentials);
  if(!webhook.credentials?.httpHeaderAuth?.id)throw Error('Configure dashboard Header Auth first');
  add('Get all leaves','dashboard-history',{operation:'executeQuery',query:readFileSync(resolve(root,'n8n/sql/change-history.sql'),'utf8'),options:{queryReplacement:'={{ [$json.query.userId || null, $json.query.cursor || null] }}'}});
  add('Respond get all leaves','Respond dashboard-history',{respondWith:'allIncomingItems',options:{}});
  for(const [source,target] of [['Webhook dashboard-history','dashboard-history'],['dashboard-history','Respond dashboard-history']]) w.connections[source]={main:[[{node:target,type:'main',index:0}]]};
  const rollover=add('Webhook get all leaves','Webhook dashboard-rollover',{
    httpMethod:'POST',path:'dashboard-rollover',authentication:'headerAuth',responseMode:'responseNode',options:{}
  });
  rollover.credentials=structuredClone(webhook.credentials);
  add('Get all leaves','dashboard-rollover',{operation:'executeQuery',query:'SELECT result.* FROM jsonb_to_record(tbs_rollover($1::jsonb)) AS result(ok boolean, "statusCode" integer, error text, rows jsonb, token text, "targetYear" integer, saved integer);',options:{queryReplacement:'={{ [JSON.stringify($json.body)] }}'}});
  add('Respond get all leaves','Respond dashboard-rollover',{respondWith:'allIncomingItems',options:{}});
  for(const [source,target] of [['Webhook dashboard-rollover','dashboard-rollover'],['dashboard-rollover','Respond dashboard-rollover']]) w.connections[source]={main:[[{node:target,type:'main',index:0}]]};
  node('Get quota').parameters.query=readFileSync(resolve(root,'n8n/sql/get-quota-with-expiry.sql'),'utf8');
  node('Get all leaves').parameters.query=readFileSync(resolve(root,'n8n/sql/get-all-leaves.sql'),'utf8')
    .replace('COALESCE(q.carried_over, 0) AS "carriedOver"', '(SELECT effective_carried FROM tbs_quota_usage(e.user_id,$1::int)) AS "carriedOver"');
    w.active=false;w.pinData={};delete w.versionId;
  return w;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [input,output]=process.argv.slice(2);
  if(!input||!output)throw Error('Usage: node scripts/patch-dashboard-features.mjs INPUT OUTPUT');
  writeFileSync(output,JSON.stringify(patchDashboardFeatures(JSON.parse(readFileSync(input,'utf8'))),null,2),{mode:0o600});
}
