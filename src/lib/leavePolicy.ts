export interface LeaveBalance {year:number;type:string;unlimited:boolean;known:boolean;total:number|null;approved:number;pending:number;requested:number;available:number|null;allowed:boolean}
export interface LeavePolicy {ok:boolean;isIntern?:boolean;unlimited:boolean;balances:LeaveBalance[];annualBalances:LeaveBalance[];deadline:string|null;late:boolean;medicalCertificateRequired:boolean}
export function exceedsBalance(policy:LeavePolicy|null,type:string):boolean {
 return !!policy&&!policy.unlimited&&(type!=='sick'||policy.isIntern)&&policy.balances.some(b=>!b.allowed);
}
