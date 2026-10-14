import {dashboardSession,dashboardCall} from './_lib/dashboardAuth.js';
import type { VercelRequest, VercelResponse } from './_lib/platform.js';
import { ceoAuthorised, json, queryParam } from './_lib/http.js';
import { n8nGet } from './_lib/n8nClient.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {

  res.setHeader('Cache-Control','no-store');
  if (!await ceoAuthorised(req)) return json(res,401,{error:'Not signed in'});
  if (req.method !== 'GET') return json(res,405,{error:'Method not allowed'});
  const cursor=queryParam(req,'cursor');
  const cohort=queryParam(req,'cohort')??'employee';
  if(!['employee','intern'].includes(cohort))return json(res,422,{error:'Invalid employee group'});
  if((await dashboardSession(req))?.role==='hr'&&cohort!=='intern')return json(res,403,{error:'Intern history only'});
  if (cursor && !/^[1-9]\d*$/.test(cursor)) return json(res,422,{error:'Invalid history cursor'});
  try {
    const result=await dashboardCall(req,'history',{userId:queryParam(req,'userId'),cursor,cohort});
    const row=Array.isArray(result)?result[0]:result;
    if (!row || !Array.isArray(row.events)) return json(res,502,{error:'History is not available. Apply the history migration and publish the workflow.'});
    return json(res,200,{events:row.events,nextCursor:row.events.length===50?row.events.at(-1).id:null});
  } catch { return json(res,502,{error:'Could not load change history. Check the n8n history workflow.'}); }
}
