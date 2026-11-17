export type Supervisor={userId:string;name:string};

export function supervisorLabel(supervisors:Supervisor[],id:string){
 const name=supervisors.find(s=>s.userId===id)?.name??id,nick=name.match(/\(([^)]+)\)\s*$/);
 return nick?`${nick[1]} · ${name.slice(0,nick.index).trim()}`:name;
}
