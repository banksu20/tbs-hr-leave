export interface HrSop {id:number;titleEn:string;titleTh:string;body:string;version:number;sortOrder:number;active:boolean;updatedAt:string;accepted:number;missing:string[]}
export interface HrRole {role:string;timeShare:number}
export interface HrPerson {id:string;code:string;name:string;nickname:string|null;department:string|null;type:'employee'|'intern';careerLevel:'operational'|'manager'|'c_level'|null;managerId:string|null;roles:HrRole[];sopPending:number}
async function call<T>(init:{view?:string;body?:Record<string,unknown>}):Promise<T>{
 const r=await fetch(init.view?`/api/hr-admin?view=${init.view}`:'/api/hr-admin',{method:init.body?'POST':'GET',cache:'no-store',headers:init.body?{'Content-Type':'application/json'}:undefined,body:init.body?JSON.stringify(init.body):undefined});
 const b=await r.json().catch(()=>({error:'HR service unavailable'}));
 if(!r.ok||!b.ok)throw new Error(b?.error||'HR service unavailable');
 return b as T;
}
export const loadSops=()=>call<{sops:HrSop[]}>({view:'sops'}).then(b=>b.sops);
export const saveSop=(body:{id?:number;version?:number;titleEn:string;titleTh:string;body:string;notify:boolean})=>call<{sops:HrSop[];notified:number}>({body:{action:'hr-sop-save',...body}});
export const setSopActive=(id:number,active:boolean)=>call<{sops:HrSop[]}>({body:{action:'hr-sop-active',id,active}}).then(b=>b.sops);
export const loadPeople=()=>call<{people:HrPerson[]}>({view:'people'}).then(b=>b.people.map(p=>({...p,roles:p.roles.map(r=>({...r,timeShare:Number(r.timeShare)}))})));
export const savePerson=(body:{userId:string;careerLevel:string;managerId:string;roles:HrRole[]})=>call<{people:HrPerson[]}>({body:{action:'hr-people-save',...body}}).then(b=>b.people.map(p=>({...p,roles:p.roles.map(r=>({...r,timeShare:Number(r.timeShare)}))})));
