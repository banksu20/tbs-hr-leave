export function patchDashboardAccounts(original){
 const w=structuredClone(original),node=w.nodes.find(n=>n.name==='Employee cancellations');
 if(!node?.parameters.query?.includes('SELECT CASE'))throw Error('Missing protected dispatcher');
 if(!node.parameters.query.includes("'dashboard-auth'"))node.parameters.query=node.parameters.query.replace('SELECT CASE',"SELECT CASE WHEN $1::text='dashboard-auth' THEN tbs_dashboard_auth($2::jsonb)");
 return w;
}
