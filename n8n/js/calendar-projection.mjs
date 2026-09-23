// Pure planner: existing manual events are never modified or adopted.
export function planCalendarSync(snapshot, pages, aliases = {}) {
  const owner='tbs-hr-approved-v1';
  const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  if(!snapshot||!validDate(snapshot.startDate)||!validDate(snapshot.endDate)||!Array.isArray(snapshot.employees)||!snapshot.employees.length||!Array.isArray(snapshot.entries))throw Error('Incomplete database snapshot; calendar unchanged.');
  if(!Array.isArray(pages)||!pages.length||pages.some(p=>!Array.isArray(p.items)||p.error)||pages.at(-1).nextPageToken)throw Error('Incomplete calendar listing; calendar unchanged.');
  const events=pages.flatMap(p=>p.items);
  if(new Set(events.map(e=>e.id)).size!==events.length)throw Error('Duplicate calendar pages; calendar unchanged.');
  const normal=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const code=e=>'TBS-'+String(e.empNo).padStart(3,'0');
  const employees=new Map(snapshot.employees.map(e=>[e.user_id,e]));
  const nextDay=d=>new Date(Date.parse(d+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const bangkokDate=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const owned=e=>e.extendedProperties?.private?.tbsHrSync===owner;
  const warnings=[];
  const manual=events.filter(e=>!owned(e)&&e.status!=='cancelled').map(event=>{
    const title=' '+normal(event.summary)+' ';
    const explicit=[...String(event.summary||'').matchAll(/\bTBS[-\s]*(\d+)\b/gi)].map(m=>Number(m[1]));
    const candidates=snapshot.employees.filter(e=>explicit.length?explicit.includes(Number(e.empNo)):[e.nickname,e.name,...(aliases[String(e.empNo)]||[])].filter(v=>normal(v).length>=2).some(v=>title.includes(' '+normal(v)+' ')));
    let start=event.start?.date, end=event.end?.date;
    if(!start&&event.start?.dateTime)start=bangkokDate(event.start.dateTime);
    if(!end&&event.end?.dateTime)end=nextDay(bangkokDate(new Date(Date.parse(event.end.dateTime)-1).toISOString()));
    if(!validDate(start)||!validDate(end))throw Error('Cannot determine existing event dates; calendar unchanged.');
    if(candidates.length!==1)warnings.push({eventId:event.id,reason:candidates.length?'Ambiguous employee name; preserve event and skip possible duplicates.':'Unmatched employee name; skip new leave on these dates for review.'});
    return {event,start,end,users:new Set(candidates.map(e=>e.user_id))};
  });
  const groups=new Map();
  for(const entry of snapshot.entries){
    if(entry.status!=='Approved')continue;
    if(!validDate(entry.date)||entry.date<snapshot.startDate||entry.date>=snapshot.endDate)throw Error('Out-of-range leave date; calendar unchanged.');
    const e=employees.get(entry.userId);
    if(!e)throw Error('Unknown employee; calendar unchanged.');
    const days=Number(entry.days);
    if(!Number.isFinite(days)||days<=0||days>1)throw Error('Invalid per-day allowance; calendar unchanged.');
    if(!/^[0-9a-v]{5,1024}$/.test(entry.eventId))throw Error('Invalid calendar ID');
    const key=entry.userId+':'+entry.date;
    if(!groups.has(key))groups.set(key,{employee:e,date:entry.date,id:entry.eventId,leaves:[]});
    groups.get(key).leaves.push(entry);
  }
  const operations=[],skipped=[],desired=new Set();
  const byId=new Map(events.map(e=>[e.id,e]));
  for(const group of groups.values()){
    const {employee,date,id,leaves}=group;
    const conflicts=manual.filter(m=>m.start<=date&&date<m.end&&(!m.users.size||m.users.has(employee.user_id)));
    if(conflicts.length){skipped.push({employee:code(employee),date,eventIds:conflicts.map(m=>m.event.id)});continue;}
    if(new Set(leaves.map(l=>l.requestId)).size!==leaves.length)throw Error('Duplicate source leave; calendar unchanged.');
    const total=leaves.reduce((sum,l)=>sum+Number(l.days),0);
    if(total>1){warnings.push({employee:code(employee),date,reason:'Overlapping approved requests exceed one day; skipped.'});desired.add(id);continue;}
    const period=total===0.5&&leaves.length===1?leaves[0].period:null;
    const suffix=total===1?'':` (${total} day${period==='morning'?' · AM':period==='afternoon'?' · PM':''})`;
    const body={summary:`${employee.nickname||employee.name} · ${code(employee)} · Leave${suffix}`,description:`Approved leave: ${total} day(s).\nManaged by TBS HR. Edit or cancel in the dashboard.\nhttps://tbs-hr-leave.vercel.app/ceo`,
      start:{date},end:{date:nextDay(date)},status:'confirmed',transparency:'transparent',reminders:{useDefault:false},
      extendedProperties:{private:{tbsHrSync:owner,employeeCode:code(employee),leaveDate:date,requestIds:leaves.map(l=>l.requestId).sort().join(',')}}};
    desired.add(id);
    const existing=byId.get(id);
    if(existing&&!owned(existing))throw Error('Calendar ID collision; calendar unchanged.');
    if(!existing)operations.push({method:'POST',id,body:{id,...body}});
    else if(['summary','description','start','end','status','transparency','reminders','extendedProperties'].some(k=>stable(existing[k])!==stable(body[k]))){
      if(!existing.etag)throw Error('Missing event version; calendar unchanged.');
      operations.push({method:'PATCH',id,etag:existing.etag,body});
    }
  }
  for(const event of events){
    if(!owned(event)||event.status==='cancelled'||desired.has(event.id))continue;
    const date=event.extendedProperties.private.leaveDate;
    if(!validDate(date)||date<snapshot.startDate||date>=snapshot.endDate)continue;
    if(!event.etag)throw Error('Missing event version; calendar unchanged.');
    operations.push({method:'PATCH',id:event.id,etag:event.etag,body:{status:'cancelled'}});
  }
  return {operations,skipped,warnings,approvedDays:groups.size,existingManual:manual.length};
}
