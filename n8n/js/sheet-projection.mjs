// Pure projection: fail before writing if a legacy row cannot be reconciled.
export function projectSheet(snapshot, values) {
  const normalize = value => String(value ?? '').toLowerCase().replace(/name\s*:?/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
  const names = snapshot.names.map(normalize).filter(parts=>parts.length>=2);
  const matches=[];
  values.forEach((row,r)=>row.forEach((cell,c)=>{
    if(!/name\s*:/i.test(String(cell)))return;
    const words=normalize(cell);
    if(names.some(parts=>parts.every(word=>words.includes(word))))matches.push({r,c});
  }));
  if(matches.length!==1)throw Error('Cannot uniquely match employee to the legacy sheet; review the employee name before syncing.');
  const {r,c}=matches[0];
  let start=-1,base=-1,taken=-1,remain=-1;
  for(let i=r+1;i<values.length;i++){
    const label=String(values[i]?.[c]??'').trim().toLowerCase();
    if(label.startsWith('name'))break;
    if(label==='date')start=i+1;
    if(label.includes('all leave'))base=i;
    if(label.includes('total taken'))taken=i;
    if(label.includes('total remain')){remain=i;break;}
  }
  if(start<0||base<=start||taken<base||remain<taken)throw Error('Legacy sheet layout is not recognized; no cells were changed.');
  const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const iso=value=>{
    const text=String(value??'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
    const m=text.match(/^(\d{1,2})[- /]([A-Za-z]{3})[- /](\d{2}|\d{4})$/);if(!m)return null;
    const month=monthNames.findIndex(x=>x.toLowerCase()===m[2].toLowerCase());if(month<0)return null;
    return `${m[3].length===2?'20'+m[3]:m[3]}-${String(month+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  };
  const types=['sick','annual','personal'];
  const signature=e=>`${e.date}|${e.type}|${Number(e.days)}`;
  const known=new Set(snapshot.known.map(signature));
  for(let i=start;i<base;i++){
    const cells=Array.from({length:5},(_,j)=>values[i]?.[c+j]??'');
    if(cells.every(x=>String(x).trim()===''))continue;
    const date=iso(cells[0]);
    const amounts=cells.slice(1,4).map(x=>Number(x)||0);
    const hasLeave=amounts.some(x=>x>0);
    if(!date||!hasLeave||amounts.some((amount,j)=>amount>0&&!known.has(signature({date,type:types[j],days:amount})))){
      throw Error(`Unreconciled legacy leave at row ${i+1}; preserve it and reconcile with the database first.`);
    }
  }
  const entries=snapshot.entries.filter(e=>e.status!=='Rejected').sort((a,b)=>a.date.localeCompare(b.date)||Number(a.requestId)-Number(b.requestId));
  if(entries.length>base-start)throw Error('Legacy sheet has no room for the current requests. Expand its leave rows first.');
  const rows=Array.from({length:base-start},()=>['','','','','']);
  entries.forEach((e,i)=>{
    const [year,month,day]=e.date.split('-');
    const amounts=types.map(type=>type===e.type?Number(e.days):'');
    rows[i]=[`${Number(day)}-${monthNames[Number(month)-1]}-${year.slice(-2)}`,...amounts,
      `${e.reason||''}${e.period?' - '+e.period:''} (${e.status==='Approved'?'Approved':'Awaiting approval'})`.trim()];
  });
  const col=n=>{let result='';for(n++;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;};
  const range=(row,endRow,offset=0,width=5)=>`'Leave report ${snapshot.year}'!${col(c+offset)}${row+1}:${col(c+offset+width-1)}${endRow+1}`;
  const totals=types.map(type=>entries.filter(e=>e.type===type).reduce((sum,e)=>sum+Number(e.days),0));
  if(!snapshot.quota)throw Error('Database quota is missing; reconcile allowances before syncing.');
  const quota=[snapshot.quota.sick_total,snapshot.quota.annual_total==null?null:Number(snapshot.quota.annual_total)+Number(snapshot.carried||0),snapshot.quota.personal_total];
  return {valueInputOption:'RAW',data:[{range:range(start,base-1),values:rows},
    {range:range(base,base,1,3),values:[quota.map(x=>x??'')]},
    {range:range(taken,taken,1,3),values:[totals]},
    {range:range(remain,remain,1,3),values:[quota.map((q,i)=>q==null?'':Number(q)-totals[i])]}]};
}
