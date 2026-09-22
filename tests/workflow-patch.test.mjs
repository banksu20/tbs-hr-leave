import test from 'node:test';
import assert from 'node:assert/strict';
import { patchWorkflow } from '../scripts/patch-n8n-workflow.mjs';

const actions=['leave-create','leave-update','leave-delete','quota-update','employee-status','employee-profile'];
const original={
  name:'test',id:'test-workflow',active:true,versionId:'previous',pinData:{private:'sample'},connections:{unchanged:true},
  nodes:[
    ...['Get all leaves','Get quota',...actions.map(action=>`dashboard-${action}`)].map(name=>({name,parameters:{query:'original',options:{queryReplacement:'original'}}})),
    {name:'Merge Sheet & DB History',parameters:{jsCode:"const rows = $('Get History from DB').all(); return rows;"}},
    ...['Webhook get all leaves',...actions.map(action=>`Webhook dashboard-${action}`)].map(name=>({name,parameters:{authentication:'none'}})),
    {name:'Unrelated workflow step',parameters:{untouched:true}},
  ],
};
test('workflow patch secures every dashboard endpoint and preserves unrelated workflow structure',()=>{
  const patched=patchWorkflow(original,'test-credential-id');
  assert.equal(patched.active,false);assert.deepEqual(patched.pinData,{});
  assert.deepEqual(patched.connections,original.connections);
  assert.equal(patched.id,original.id);
  for(const node of patched.nodes.filter(node=>node.name.startsWith('Webhook'))) {
    assert.equal(node.parameters.authentication,'headerAuth');
    assert.equal(node.credentials.httpHeaderAuth.id,'test-credential-id');
  }
  assert.deepEqual(patched.nodes.at(-1),original.nodes.at(-1));
  assert.equal(original.active,true);assert.equal(original.nodes[0].parameters.query,'original');
});
test('history reference resolves the actual upstream DB1 node',()=>{
  const patched=patchWorkflow(original,'credential');
  const code=patched.nodes.find(node=>node.name==='Merge Sheet & DB History').parameters.jsCode;
  const history=[{json:{id:1}}];
  const result=new Function('$',code)(name=>{assert.equal(name,'Get History from DB1');return {all:()=>history};});
  assert.deepEqual(result,history);
});
test('missing credential is explicit and writes bind one JSON parameter',()=>{
  const patched=patchWorkflow(original);
  assert.equal(patched.nodes.find(node=>node.name==='Webhook dashboard-leave-create').credentials.httpHeaderAuth.id,'CONFIGURE_HEADER_AUTH_BEFORE_PUBLISHING');
  for(const operation of ['create','update','delete']) {
    const node=patched.nodes.find(node=>node.name===`dashboard-leave-${operation}`);
    assert.equal(node.parameters.options.queryReplacement,'={{ [JSON.stringify($json.body)] }}');
    assert.match(node.parameters.query,/tbs_dashboard_request/);
  }
});
