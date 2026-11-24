export interface HrSop {id:number;titleEn:string;titleTh:string;body:string;bodyEn:string;version:number;sortOrder:number;active:boolean;updatedAt:string;accepted:number;missing:string[]}
export interface HrRole {role:string;timeShare:number}
export interface HrPerson {id:string;code:string;name:string;nickname:string|null;department:string|null;type:'employee'|'intern';careerLevel:'operational'|'manager'|'c_level'|null;managerId:string|null;roles:HrRole[];sopPending:number}
async function call<T>(init:{view?:string;body?:Record<string,unknown>}):Promise<T>{
 const r=await fetch(init.view?`/api/hr-admin?view=${init.view}`:'/api/hr-admin',{method:init.body?'POST':'GET',cache:'no-store',headers:init.body?{'Content-Type':'application/json'}:undefined,body:init.body?JSON.stringify(init.body):undefined});
 const b=await r.json().catch(()=>({error:'HR service unavailable'}));
 if(!r.ok||!b.ok)throw new Error(b?.error||'HR service unavailable');
 return b as T;
}
export const loadSops=()=>call<{sops:HrSop[]}>({view:'sops'}).then(b=>b.sops);
export const saveSop=(body:{id?:number;version?:number;titleEn:string;titleTh:string;body:string;bodyEn:string;notify:boolean})=>call<{sops:HrSop[];notified:number}>({body:{action:'hr-sop-save',...body}});
export const setSopActive=(id:number,active:boolean)=>call<{sops:HrSop[]}>({body:{action:'hr-sop-active',id,active}}).then(b=>b.sops);
export const loadPeople=()=>call<{people:HrPerson[]}>({view:'people'}).then(b=>b.people.map(p=>({...p,roles:p.roles.map(r=>({...r,timeShare:Number(r.timeShare)}))})));
export const savePerson=(body:{userId:string;careerLevel:string;managerId:string;roles:HrRole[]})=>call<{people:HrPerson[]}>({body:{action:'hr-people-save',...body}}).then(b=>b.people.map(p=>({...p,roles:p.roles.map(r=>({...r,timeShare:Number(r.timeShare)}))})));
export interface TravelSettings {officeLat:number|null;officeLng:number|null;radius:number;rate:number;homeCutoff:string;tripKmCap:number;accountingEmail:string|null;departments:string[];payoutNotify?:string|null}
export interface TravelPerson {id:string;name:string;nickname:string|null;department:string|null;eligible:boolean;override:boolean|null}
export type AdminTrip=import('./travel').TripDetail&{employee:string;department:string|null};
export type AdminTripRow=import('./travel').TripSummary&{employee:string;department:string|null};
export const loadTravelSettings=()=>call<{settings:TravelSettings;people:TravelPerson[]}>({view:'travel'});
export const saveTravelSettings=(body:Partial<Omit<TravelSettings,'accountingEmail'>>&{accountingEmail?:string})=>call<{settings:TravelSettings;people:TravelPerson[]}>({body:{action:'travel-settings-save',...body}});
export const saveTravelAccess=(userId:string,allowed:boolean|null)=>call<{people:TravelPerson[]}>({body:{action:'travel-access-save',userId,allowed}}).then(b=>b.people);
export const findOffice=(query:string)=>call<{places:import('./travel').Place[]}>({body:{action:'travel-place',query}}).then(b=>b.places);
export const loadTrips=(status:string)=>call<{trips:AdminTripRow[]}>({view:`trips&status=${encodeURIComponent(status)}`}).then(b=>b.trips);
export const loadTrip=(id:number)=>call<{trip:AdminTrip}>({view:`trip&id=${id}`}).then(b=>b.trip);
export const decideTrip=(id:number,decision:'approve'|'reject',note:string)=>call<{trip:AdminTrip}>({body:{action:'travel-decide',id,decision,note}}).then(b=>b.trip);
export interface PayoutLine {id:number;date:string;status:string;clients:string[];km:number;kmAmount:number;receiptAmount:number;total:number;originalsWaiting:number}
export interface PayoutPerson {userId:string;code:string;name:string;nickname:string|null;department:string|null;trips:number;flagged:number;km:number;kmAmount:number;receiptAmount:number;total:number;paid:number;ready:number;held:number;paperMissing:number;lines:PayoutLine[]}
const numbers=(p:PayoutPerson):PayoutPerson=>({...p,km:Number(p.km),kmAmount:Number(p.kmAmount),receiptAmount:Number(p.receiptAmount),total:Number(p.total),paid:Number(p.paid),ready:Number(p.ready),held:Number(p.held),lines:p.lines.map(l=>({...l,km:Number(l.km),kmAmount:Number(l.kmAmount),receiptAmount:Number(l.receiptAmount),total:Number(l.total)}))});
export const loadPayout=(month:string)=>call<{people:PayoutPerson[]}>({view:`payout&month=${encodeURIComponent(month)}`}).then(b=>b.people.map(numbers));
export const markPayoutPaid=(month:string,userId?:string)=>call<{people:PayoutPerson[];marked:number}>({body:{action:'travel-payout-paid',month,...(userId?{userId}:{})}}).then(b=>({marked:b.marked,people:b.people.map(numbers)}));
export const markTrip=(id:number,mark:'paid'|'received')=>call<{trip:AdminTrip}>({body:{action:'travel-mark',id,mark}}).then(b=>b.trip);
export const adminReceiptUrl=(id:string)=>`/api/hr-admin?view=receipt&id=${encodeURIComponent(id)}`;
