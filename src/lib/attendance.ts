import liff from '@line/liff';
export interface Shift {id:number;date:string;in:string;out:string|null;missedOut:boolean;edited:boolean;workedMin:number;overtimeMin:number;inPhoto?:boolean;outPhoto?:boolean;inLat?:number|null;inLng?:number|null;inAccuracy?:number|null;outLat?:number|null;outLng?:number|null;outAccuracy?:number|null}
export type FixStatus='pending'|'approved'|'rejected'|'cancelled';
export interface Fix {id:number;userId:string;employee:string;shiftId:number|null;date:string;in:string;out:string;workedMin:number;reason:string;status:FixStatus;decidedBy:string|null;decidedAt:string|null;note:string|null;createdAt:string;was:{in:string;out:string|null;missedOut:boolean}|null}
export interface AttendanceSettings {workMinutes:number;breakMinutes:number;breakAfterMinutes:number;locationDays:number}
export type AttendanceKind='part-time'|'wfh';
export interface AttendanceState {enabled:boolean;member:boolean;eligible:boolean;kind:AttendanceKind;wfhDays:number[];workToday:boolean;settings:AttendanceSettings;today:string;open:Shift|null;shifts:Shift[];weekMin:number;monthMin:number;fixes:Fix[]}
export class AttendanceError extends Error {constructor(message:string,public status:number,public state?:AttendanceState){super(message);}}

const token=()=>{const t=liff.getAccessToken();if(!t)throw new AttendanceError('Please open this page in LINE.',401);return t;};
async function call(body?:Record<string,unknown>):Promise<AttendanceState>{
 const r=await fetch('/api/attendance',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token()}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const b=await r.json().catch(()=>({error:'Service unavailable'}));
 if(!r.ok||!b.ok)throw new AttendanceError(b?.error||'Service unavailable',r.status,b?.shifts?b:undefined);
 return b as AttendanceState;
}
export const loadAttendance=()=>call();
export const attendanceAction=(action:string,body:Record<string,unknown>={})=>call({action,...body});

export const hours=(min:number)=>{const m=Math.max(0,Math.round(min));return `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;};
export const clock=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}):'—';
export const bkkTime=(iso:string)=>clock(iso);
export const dayLabel=(date:string,th:boolean)=>new Date(date+'T00:00:00+07:00').toLocaleDateString(th?'th-TH':'en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Bangkok'});
export const mapLink=(lat:number|null|undefined,lng:number|null|undefined)=>lat!=null&&lng!=null?`https://www.google.com/maps?q=${lat},${lng}`:null;
export const weekdays=(days:number[],th:boolean)=>days.map(d=>new Date(Date.UTC(2024,0,d)).toLocaleDateString(th?'th-TH':'en-GB',{weekday:'short',timeZone:'UTC'})).join(', ');
