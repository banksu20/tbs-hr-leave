import type {VercelRequest,VercelResponse} from '@vercel/node';
import companyHolidays from './_handlers/company-holidays.js';
import employeeRequest from './_handlers/employee-request.js';
import internDecision from './_handlers/intern-decision.js';
import internTerms from './_handlers/intern-terms.js';
import leaveEvidence from './_handlers/leave-evidence.js';
import leavePolicy from './_handlers/leave-policy.js';
import registration from './_handlers/registration.js';
import {json} from './_lib/http.js';
const handlers:Record<string,(req:VercelRequest,res:VercelResponse)=>Promise<unknown>>={
 'company-holidays':companyHolidays,'employee-request':employeeRequest,
 'intern-decision':internDecision,'intern-terms':internTerms,
 'leave-evidence':leaveEvidence,'leave-policy':leavePolicy,registration,
};
export default async function handler(req:VercelRequest,res:VercelResponse){
 const name=new URL(req.url??'','https://local.invalid').pathname.match(/^\/api\/([a-z-]+)\/?$/)?.[1];
 const route=name&&Object.hasOwn(handlers,name)?handlers[name]:undefined;
 if(!route)return json(res,404,{error:'Endpoint not found'});
 return route(req,res);
}
