import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ceoAuthorised, json, queryParam } from './_lib/http.js';
import { n8nGet } from './_lib/n8nClient.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ceoAuthorised(req)) return json(res,401,{error:'Not signed in'});
  if (req.method !== 'GET') return json(res,405,{error:'Method not allowed'});
  const cursor=queryParam(req,'cursor');
  if (cursor && !/^[1-9]\d*$/.test(cursor)) return json(res,422,{error:'Invalid history cursor'});
  try {
    const result=await n8nGet('dashboard-history',{userId:queryParam(req,'userId'),cursor});
    const row=Array.isArray(result)?result[0]:result;
    if (!row || !Array.isArray(row.events)) return json(res,502,{error:'History is not available. Apply the history migration and publish the workflow.'});
    return json(res,200,{events:row.events,nextCursor:row.events.length===50?row.events.at(-1).id:null});
  } catch { return json(res,502,{error:'Could not load change history. Check the n8n history workflow.'}); }
}
