// Deploy /api/employee-data and its frontend callers before publishing this patch.
export function patchEmployeeReadAuth(original){
 const w=structuredClone(original);
 const credential=w.nodes.find(n=>n.name==='Webhook get all leaves')?.credentials?.httpHeaderAuth;
 if(!credential)throw Error('Existing server webhook credential is required');
 for(const name of ['Check User API','Get Quota API','Webhook get history','Webhook Get Calendar']){
  const node=w.nodes.find(n=>n.name===name);if(!node)throw Error('Missing employee read webhook: '+name);
  node.parameters={...node.parameters,authentication:'headerAuth'};
  node.credentials={...node.credentials,httpHeaderAuth:{...credential}};
 }
 return w;
}
