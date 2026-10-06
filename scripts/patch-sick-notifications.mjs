// Apply 016–018 first. Adds an isolated clock; existing approval and delivery paths stay intact.
export function patchSickNotifications(original) {
 const w=structuredClone(original);
 const db=w.nodes.find(n=>n.type==='n8n-nodes-base.postgres'&&n.credentials?.postgres);
 if(!db)throw new Error('Existing PostgreSQL credential required');
 const nodes=[
  {id:'sick-notification-clock',name:'Check sick notification clock',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[-640,3640],parameters:{rule:{interval:[{field:'minutes',minutesInterval:1}]}}},
  {id:'sick-notification-check',name:'Queue sick milestones due today',type:'n8n-nodes-base.postgres',typeVersion:2.7,position:[-400,3640],credentials:db.credentials,parameters:{operation:'executeQuery',query:'SELECT tbs_run_sick_daily() AS queued;',options:{}}},
 ];
 for(const node of nodes){const existing=w.nodes.find(n=>n.name===node.name);if(existing)Object.assign(existing,node,{id:existing.id});else w.nodes.push(node);}
 w.connections[nodes[0].name]={main:[[{node:nodes[1].name,type:'main',index:0}]]};
 const endpoint=w.nodes.find(n=>n.name==='Employee cancellations');
 if(!endpoint?.parameters?.query?.includes('SELECT CASE'))throw new Error('Existing cancellation endpoint is required');
 if(!endpoint.parameters.query.includes("'sick-language'"))endpoint.parameters.query=endpoint.parameters.query.replace('SELECT CASE',"SELECT CASE WHEN $1::text='sick-language' THEN tbs_set_sick_language($2::jsonb)");
 if(!endpoint.parameters.query.includes("'sick-acknowledge'"))endpoint.parameters.query=endpoint.parameters.query.replace('SELECT CASE',"SELECT CASE WHEN $1::text IN ('sick-review','sick-acknowledge') THEN tbs_sick_acknowledge($1::text,$2::jsonb)");
 return w;
}
