// Existing Calendar projection remains authoritative; retries rebuild from current state.
export function calendarMonitoringOperations(workflow){
 const existing=new Set(workflow.nodes.map(n=>n.name));
 const pg=workflow.nodes.find(n=>n.type==='n8n-nodes-base.postgres').credentials;
 const nodes=[
  {name:'Claim calendar sync',type:'n8n-nodes-base.postgres',typeVersion:2.7,position:[0,400],credentials:pg,parameters:{operation:'executeQuery',query:'SELECT * FROM tbs_claim_calendar_sync();',options:{}}},
  {name:'Calendar has changes?',type:'n8n-nodes-base.if',typeVersion:2.2,position:[1150,0],parameters:{conditions:{options:{typeValidation:'strict',caseSensitive:true,leftValue:''},conditions:[{leftValue:'={{ $json.operations.length }}',rightValue:0,operator:{type:'number',operation:'gt'}}],combinator:'and'},options:{}}},
  {name:'Record calendar success',type:'n8n-nodes-base.postgres',typeVersion:2.7,position:[2000,0],credentials:pg,parameters:{operation:'executeQuery',query:'SELECT tbs_finish_calendar_sync($1::uuid,NULL) AS saved;',options:{queryReplacement:"={{ [$('Claim calendar sync').first().json.run_token] }}"}}},
  {name:'Record calendar failure',type:'n8n-nodes-base.postgres',typeVersion:2.7,position:[2000,300],credentials:pg,parameters:{operation:'executeQuery',query:'SELECT tbs_finish_calendar_sync($1::uuid,$2::text) AS saved;',options:{queryReplacement:"={{ [$('Claim calendar sync').first().json.run_token,'Calendar sync failed. Check Google connection and workflow execution '+$execution.id+'.'] }}"}}}
 ];
 const ops=nodes.map(node=>existing.has(node.name)?{type:'updateNodeParameters',nodeName:node.name,parameters:node.parameters}:{type:'addNode',node});
 const connection=(type,source,target,sourceIndex=0)=>({type,source,target,sourceIndex,targetIndex:0});
 for(const source of ['Check calendar connection','Sync approved leave every five minutes']){
  if(workflow.connections[source]?.main?.[0]?.some(c=>c.node==='Read Staff Leave access'))ops.push(connection('removeConnection',source,'Read Staff Leave access'));
  ops.push(connection('addConnection',source,'Claim calendar sync'));
 }
 ops.push(connection('addConnection','Claim calendar sync','Read Staff Leave access'));
 if(workflow.connections['Plan approved leave sync']?.main?.[0]?.some(c=>c.node==='Apply planned changes'))ops.push(connection('removeConnection','Plan approved leave sync','Apply planned changes'));
 ops.push(connection('addConnection','Plan approved leave sync','Calendar has changes?'),connection('addConnection','Calendar has changes?','Apply planned changes'),connection('addConnection','Calendar has changes?','Record calendar success',1),connection('addConnection','Check calendar write results','Record calendar success'));
 for(const name of ['Read Staff Leave access','Read approved leave','Read existing calendar events','Plan approved leave sync','Apply planned changes','Write managed calendar events','Check calendar write results']){
  ops.push({type:'setNodeSettings',nodeName:name,settings:{onError:'continueErrorOutput'}},connection('addConnection',name,'Record calendar failure',1));
 }
 // Poll for user-requested retries; the database retains the normal five-minute cadence.
 ops.push({type:'updateNodeParameters',nodeName:'Sync approved leave every five minutes',parameters:{rule:{interval:[{field:'seconds',secondsInterval:30}]}}});
 ops.push({type:'setWorkflowSettings',settings:{executionTimeout:480}});
 return ops;
}
export function lineMonitoringOperations(workflow){
 const bridge=workflow.nodes.find(n=>n.name==='Employee cancellations');
 const finish=workflow.nodes.find(n=>n.name==='Finish LINE delivery');
 const parameters=JSON.parse(JSON.stringify(bridge.parameters));
 if(!parameters.query.includes("'verified-rejection'"))parameters.query=parameters.query.replace('SELECT CASE WHEN',"SELECT CASE WHEN $1::text='verified-rejection' THEN tbs_verified_rejection($2::jsonb) WHEN");
 const completion=JSON.parse(JSON.stringify(finish.parameters));
 completion.options.queryReplacement=completion.options.queryReplacement.replace("'LINE delivery failed; check the workflow execution'","'LINE delivery failed ('+String($json.statusCode||'network error')+'). Execution '+$execution.id");
 return [{type:'updateNodeParameters',nodeName:bridge.name,parameters},{type:'updateNodeParameters',nodeName:finish.name,parameters:completion}];
}
