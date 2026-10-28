import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';
const {dashboardText,dashboardThai}=loadTS()('src/lib/dashboardTranslations.ts');
const wrap=tag=>props=>React.createElement(tag,props,props.children);
const dialogMock=Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(n=>[n,wrap('div')]));

test('dashboard copy keys exist and static labels cannot silently remain English',()=>{
 const files=fs.readdirSync('src/components/ceo').filter(f=>f.endsWith('.tsx')).map(f=>'src/components/ceo/'+f).concat(['src/pages/CeoDashboard.tsx','src/hooks/useLeaveMutations.ts']);
 const brands=new Set(['TBS','TBS HR','TBS Marketing','Google Calendar']);
 for(const file of files){const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,99,true,ts.ScriptKind.TSX);function visit(n){
  if(ts.isCallExpression(n)&&n.expression.getText(ast)==='dt'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))assert.ok(dashboardThai[n.arguments[0].text],file+': '+n.arguments[0].text);
  if(ts.isJsxText(n)){const text=n.text.replace(/\s+/g,' ').trim();if(/[a-zA-Z]/.test(text)&&!brands.has(text)&&text!=='&bull;')assert.fail(file+': untranslated '+text);}
  ts.forEachChild(n,visit);
 }visit(ast);}
 assert.equal(dashboardText('th','Request approved'),'อนุมัติคำขอแล้ว');
 assert.equal(dashboardText('en','Days taken ({0})',['2026']),'Days taken (2026)');
 assert.equal(dashboardText('th','Days taken ({0})',['2026']),'วันลาที่ใช้ (2026)');
 assert.equal(dashboardText('th','Unknown diagnostic'),'Unknown diagnostic');
});

test('language switch updates intern navigation and badge without changing tab IDs',async()=>{
 let language='en',chosen;const Component=loadTS({
  '@/hooks/useLanguage':{useLanguage:()=>({language})},
  '@tanstack/react-query':{useQuery:({queryKey})=>({data:queryKey[0]==='cancellations'?[{id:1}]:2})},
  '@/components/ui/dropdown-menu':Object.fromEntries(['DropdownMenu','DropdownMenuContent','DropdownMenuRadioGroup','DropdownMenuRadioItem','DropdownMenuTrigger'].map(n=>[n,wrap(n)]))
 })('src/components/ceo/InternNavigation.tsx').default;
 let view;try{await act(async()=>{view=renderer.create(React.createElement(Component,{tab:'overview',pendingCount:1,onChange:v=>{chosen=v;}}));});
 assert.match(JSON.stringify(view.toJSON()),/Approvals/);
 language='th';await act(async()=>view.update(React.createElement(Component,{tab:'overview',pendingCount:1,onChange:v=>{chosen=v;}})));
 const copy=JSON.stringify(view.toJSON());assert.match(copy,/รออนุมัติ 2 รายการ/);assert.match(copy,/จัดการนักศึกษาฝึกงาน/);assert.doesNotMatch(copy,/Approvals|Overview|Manage interns/);
 const button=view.root.findAllByType('button').find(b=>React.Children.toArray(b.props.children).includes('รออนุมัติ'));
 await act(async()=>button.props.onClick());assert.equal(chosen,'pending');
 }finally{view?.unmount();}
});

test('Thai calendar status filters keep canonical values and preserve employee names',async()=>{
 let language='th';const Component=loadTS({'@/hooks/useLanguage':{useLanguage:()=>({language})}})('src/components/ceo/TeamCalendar.tsx').default;
 const month=String(new Date().getMonth()+1).padStart(2,'0');
 const employees=[{id:'1',name:'Morning',nickname:'',empCode:'TBS-001',department:'AI',leaves:[{id:'a',date:`2026-${month}-02`,type:'sick',status:'Approved',days:1},{id:'b',date:`2026-${month}-03`,type:'annual',status:'Pending',days:0.5,halfDayPeriod:'afternoon'}]}];
 let view;try{await act(async()=>{view=renderer.create(React.createElement(Component,{employees,year:'2026'}));});
 assert.match(JSON.stringify(view.toJSON()),/ช่วงบ่าย/);
 const select=view.root.findByProps({'aria-label':'สถานะปฏิทิน'});
 assert.deepEqual(select.findAllByType('option').map(o=>o.props.value),['all','Approved','Pending']);
 await act(async()=>select.props.onChange({target:{value:'Approved'}}));assert.equal(view.root.findAllByType('article').length,1);assert.match(JSON.stringify(view.toJSON()),/Morning/);
 language='en';await act(async()=>view.update(React.createElement(Component,{employees,year:'2026'})));assert.equal(view.root.findByProps({'aria-label':'Calendar status'}).props.value,'Approved');assert.equal(view.root.findAllByType('article').length,1);
 }finally{view?.unmount();}
});

test('Thai intern exports retain university type when toggled and leave user data untouched',async()=>{
 const Component=loadTS({'@/hooks/useLanguage':{useLanguage:()=>({language:'th'})},'@/components/ui/dialog':dialogMock,'@/components/ui/button':{Button:wrap('button')}})('src/components/ceo/MonthlyExportDialog.tsx').default;
 const props={employees:[{id:'1',name:'Annual',empCode:'TBSInterns-001',nickname:'',department:'AI',leaves:[{id:'a',date:'2026-10-20',type:'university',status:'Approved',days:1}]}],year:'2026',initialMonth:10,initialTypes:['sick'],scope:'Interns',ready:true,onClose(){}};
 let view;try{await act(async()=>{view=renderer.create(React.createElement(Component,props));});
 const university=view.root.findAllByType('label').find(l=>React.Children.toArray(l.props.children).includes('กิจกรรมมหาวิทยาลัย'));
 assert.ok(university);await act(async()=>university.findByType('input').props.onChange({target:{checked:true}}));
 assert.ok(view.root.findAllByType('th').some(t=>t.props.children==='กิจกรรมมหาวิทยาลัย'));assert.match(JSON.stringify(view.toJSON()),/Annual/);
 }finally{view?.unmount();}
});

test('dashboard leave editor uses the same reason requirements as employee requests',async()=>{
 const Component=loadTS({
  '@/hooks/useLanguage':{useLanguage:()=>({language:'en'})},
  '@/components/ui/dialog':dialogMock,
  '../LeaveEvidence':{default:()=>null},
 })('src/components/ceo/LeaveRecordDialog.tsx').default;
 for(const type of ['annual','personal','sick','university']){
  let view;try{
   await act(async()=>{view=renderer.create(React.createElement(Component,{employeeName:'Test',initial:{type,note:'',dates:['2099-01-05'],expectedDates:['2099-01-05'],daysPerDate:1,expectedRevision:'r',scope:'request',status:'Pending'},onClose(){},onSave:async()=>{}}));});
   const note=view.root.findAllByType('input').find(i=>i.props.value==='');assert.ok(note);assert.equal(note.props.required,type!=='annual',type);
  }finally{view?.unmount();}
 }
});
