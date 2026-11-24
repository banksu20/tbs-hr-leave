import liff from '@line/liff';
export type TripStatus='open'|'submitted'|'flagged'|'approved'|'rejected'|'paid'|'cancelled';
export interface TripStop {id:number;seq:number;clientName:string;label:string;lat:number;lng:number;arrivedAt:string|null}
export interface TripPoint {id:number;kind:'start_office'|'start_home'|'arrive'|'return_office';stopId:number|null;lat:number;lng:number;accuracy:number|null;at:string}
export interface TripLeg {id:number;from:number;to:number;routeKm:number;km:number;amount:number;capped:boolean}
export interface TripReceipt {id:string;kind:ReceiptKind;mime:string;readAmount:number|null;readDate:string|null;readTime?:string|null;readIsReceipt?:boolean|null;readKind?:ReceiptKind|null;readMerchant?:string|null;readRef?:string|null;duplicate?:boolean;wrongTime?:boolean;wrongKind?:boolean;amount:number;edited:boolean;needsOriginal:boolean;originalReceivedAt:string|null;createdAt:string}
export type ReceiptKind='toll'|'parking'|'grab'|'taxi'|'other';
export interface TripSummary {id:number;date:string;purpose:'deal'|'care';dealRef:string|null;mode:'car'|'grab'|'taxi';startFrom:'office'|'home';appointment:string|null;rate:number;status:TripStatus;flags:string[];autoClosed:boolean;submittedAt:string|null;decidedAt:string|null;decidedBy:string|null;decisionNote:string|null;paidAt:string|null;clients:string[];km:number;kmAmount:number;receiptAmount:number;total:number;originalsWaiting:number}
export interface TripDetail extends TripSummary {stops:TripStop[];points:TripPoint[];legs:TripLeg[];receipts:TripReceipt[]}
export interface TravelState {eligible:boolean;configured:boolean;settings:{officeLat:number|null;officeLng:number|null;radius:number;rate:number;homeCutoff:string};trip:TripDetail|null;recent:TripSummary[];submitted?:TripSummary}
export interface Place {lat:number;lng:number;label:string}
export interface ReceiptRead {amount:number|null;date:string|null;kind:ReceiptKind|null;time:string|null;isReceipt:boolean|null;merchant:string|null;ref:string|null}
export class TravelError extends Error {constructor(message:string,public status:number,public state?:TravelState,public distanceM?:number){super(message);}}

const token=()=>{const t=liff.getAccessToken();if(!t)throw new TravelError('Please open this page in LINE.',401);return t;};
async function call<T>(body?:Record<string,unknown>):Promise<T>{
 const r=await fetch('/api/travel',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token()}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const b=await r.json().catch(()=>({error:'Service unavailable'}));
 if(!r.ok||!b.ok)throw new TravelError(b?.error||'Service unavailable',r.status,b?.trip!==undefined?b:undefined,b?.distanceM);
 return b as T;
}
export const loadTravel=()=>call<TravelState>();
export const travelAction=(action:string,body:Record<string,unknown>={})=>call<TravelState>({action,...body});
export const findPlaces=async(query:string)=>(await call<{places:Place[]}>({action:'place',query})).places;
export const readReceipt=async(mime:string,content:string)=>{const r=await call<{read:ReceiptRead;readSig:string}>({action:'receipt-read',mime,content});return {read:r.read,sig:r.readSig};};
export async function receiptUrl(id:string){
 const r=await fetch(`/api/travel?receipt=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token()}`}});
 if(!r.ok)throw new TravelError('Receipt not found.',r.status);
 return URL.createObjectURL(await r.blob());
}

export interface Fix {lat:number;lng:number;accuracy:number}
export function currentPosition():Promise<Fix>{
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation)return reject(new TravelError('This phone cannot share location.',0));
  navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:Math.round(p.coords.accuracy)}),
   e=>reject(new TravelError(e.code===1?'Allow location for LINE in your phone settings, then try again.':'Could not find your location. Move outside or near a window and try again.',0)),
   {enableHighAccuracy:true,timeout:20000,maximumAge:0});
 });
}

const toBase64=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]??'');r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
export async function prepareFile(file:File):Promise<{mime:string;content:string;preview:string}>{
 if(file.type==='application/pdf'){
  if(file.size>2097152)throw new TravelError('PDF must be 2 MB or smaller.',422);
  return {mime:file.type,content:await toBase64(file),preview:''};
 }
 if(!file.type.startsWith('image/'))throw new TravelError('Use a photo or a PDF.',422);
 const bitmap=await createImageBitmap(file).catch(()=>{throw new TravelError('This photo could not be opened. Try taking it again.',422);});
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 for(const q of [0.82,0.7,0.55]){
  const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/jpeg',q));
  if(blob&&blob.size<=2097152)return {mime:'image/jpeg',content:await toBase64(blob),preview:URL.createObjectURL(blob)};
 }
 throw new TravelError('This photo is too large.',422);
}
export const money=(n:number|string)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
export type T=(en:string,th:string)=>string;
export function statusLabel(s:TripStatus,text:T){
 return ({open:text('In progress','กำลังเดินทาง'),submitted:text('Sent to accounting','ส่งบัญชีแล้ว'),flagged:text('Waiting for review','รอตรวจสอบ'),approved:text('Approved','อนุมัติแล้ว'),rejected:text('Rejected','ไม่อนุมัติ'),paid:text('Paid','จ่ายแล้ว'),cancelled:text('Cancelled','ยกเลิก')} as const)[s];
}
export function flagLabel(f:string,text:T){
 return ({gps_weak:text('Weak GPS','GPS ไม่แม่น'),too_fast:text('Too fast for the distance','เร็วผิดปกติ'),over_cap:text('Over the daily km limit','เกินระยะต่อวัน'),far_from_client:text('Checked in far from the client','เช็กอินห่างจากลูกค้า'),fare_high:text('Fare looks high','ค่าโดยสารสูงผิดปกติ'),no_checkin:text('No client check-in','ไม่ได้เช็กอินที่ลูกค้า'),receipt_not_receipt:text('Photo is not a receipt','รูปไม่ใช่ใบเสร็จ'),receipt_date:text('Receipt from another day','ใบเสร็จคนละวัน'),receipt_time:text('Receipt time outside the trip','เวลาใบเสร็จไม่อยู่ในช่วงทริป'),receipt_duplicate:text('Receipt used before','ใบเสร็จถูกใช้ซ้ำ'),receipt_kind:text('Receipt does not match the trip','ใบเสร็จไม่ตรงกับการเดินทาง')} as Record<string,string>)[f]??f;
}
export function monthSummary(recent:TripSummary[]){
 const ym=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'}).slice(0,7);
 const list=recent.filter(t=>t.date.startsWith(ym)&&!['rejected','cancelled'].includes(t.status));
 return {total:list.reduce((s,t)=>s+Number(t.total),0),trips:list.length,paper:recent.reduce((s,t)=>s+t.originalsWaiting,0)};
}
