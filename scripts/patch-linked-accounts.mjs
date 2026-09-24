import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export function patchLinkedAccounts(original) {
 const w=structuredClone(original);
 const node=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw Error('Missing '+name);return n};
 const addResolver=(name,kind,trigger,target)=>{
  let n=w.nodes.find(n=>n.name===name);
  if(!n){n={...structuredClone(node('Get quota')),id:randomUUID(),name,position:[-500,kind==='body'?0:300]};w.nodes.push(n);}
  n.parameters={operation:'executeQuery',query:`SELECT jsonb_set($1::jsonb,'{userId}',to_jsonb(tbs_resolve_employee($1::jsonb->>'userId'))) || jsonb_build_object('submittedBy',$1::jsonb->>'userId') AS ${kind};`,options:{queryReplacement:`={{ [JSON.stringify($json.${kind} || {})] }}`}};
  w.connections[trigger]={main:[[{node:name,type:'main',index:0}]]};
  w.connections[name]={main:[[{node:target,type:'main',index:0}]]};
 };
 addResolver('Resolve submitting account','body','Main Webhook','Clean Dates');
 addResolver('Resolve profile account','query','Check User API','Find in Users Sheet');
 addResolver('Resolve history account','query','Webhook get history','Get History from DB1');
 node('Get quota').parameters.query=node('Get quota').parameters.query.replace('q.user_id=$1 AND','q.user_id=tbs_resolve_employee($1) AND');
 node('Get History from DB1').parameters.query=node('Get History from DB1').parameters.query.replace('WHERE user_id = $1','WHERE user_id = tbs_resolve_employee($1)');
 node('Find Name from UserID (History)').parameters.filtersUI.values[0].lookupValue="={{ $('Resolve history account').first().json.query.userId }}";
 const base=readFileSync(new URL('../n8n/sql/get-all-leaves.sql',import.meta.url),'utf8');
 node('Get all leaves').parameters.query=base.replace('GROUP BY e.user_id','WHERE NOT EXISTS (SELECT 1 FROM tbs_employee_accounts a WHERE a.account_user_id=e.user_id)\nGROUP BY e.user_id');
 return w;
}
