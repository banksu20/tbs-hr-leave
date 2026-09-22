import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';
const load=loadTS();
const {monthlyTotals,busiestMonth}=load('src/components/ceo/overviewData.ts');
const {buildMonthlyReport,csvCell}=load('src/lib/monthlyReport.ts');
const employee=(id,name,leaves)=>({id,name,empCode:`TBS-${id}`,nickname:name,department:'QA',status:'active',quotas:{annualTotal:12,sickTotal:30,personalTotal:3,carriedOver:0},leaves});
const row=(date,type,days,status='Approved')=>({id:`${date}-${type}`,date,type,days,status,note:'Private reason excluded'});
const employees=[employee('1','Alice',[row('2026-09-01','sick',0.5),row('2026-09-02','annual',1),row('2026-09-03','personal',0.25),row('2026-09-04','annual',1,'Pending'),row('2026-09-05','sick',1,'Rejected'),row('2026-10-01','annual',1),row('2025-09-01','sick',1)]),employee('2','Bob',[row('2026-09-01','annual',1)])];

test('chart totals and peak follow selected leave types including empty selection',()=>{
 const all=monthlyTotals(employees,'2026');assert.equal(all[8].total,2.75);
 const sick=monthlyTotals(employees,'2026',['sick']);assert.equal(sick[8].total,0.5);assert.equal(sick[8].annual,0);assert.equal(busiestMonth(sick).month,'Sep');
 assert.equal(busiestMonth(monthlyTotals(employees,'2026',[])),null);
});
test('monthly report exports only selected employees, month and approved leave types',()=>{
 const report=buildMonthlyReport([employees[0]],'2026',9,['sick','personal'],'Department: QA');
 assert.equal(report.total,0.75);assert.equal(report.rows.length,1);assert.equal(report.rows[0].annual,0);
 assert.ok(report.csv.startsWith('\uFEFF'));assert.match(report.csv,/"Sick days","Personal days"/);
 assert.doesNotMatch(report.csv,/Bob|Private reason|Pending|Annual days/);
 assert.throws(()=>buildMonthlyReport(employees,'2026',13,['sick'],''));
 assert.throws(()=>buildMonthlyReport(employees,'2026',9,[],''));
 const zero=buildMonthlyReport([employees[1]],'2026',9,['sick'],'All');assert.equal(zero.rows.length,1);assert.equal(zero.total,0);
});
test('CSV handles Thai, commas, quotes and spreadsheet formulas safely',()=>{
 assert.equal(csvCell('สมชาย, "Test"'),'"สมชาย, ""Test"""');
 for(const prefix of ['=','+','-','@','\t=','\r+'])assert.ok(csvCell(prefix+'SUM(1)').startsWith('"\''));
 assert.equal(csvCell(0.25),'"0.25"');
});
test('employee selection controls export preview and stale data disables download',async()=>{
 const wrap=tag=>props=>React.createElement(tag,props,props.children);
 const Component=loadTS({
  '@/components/ui/dialog':Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(n=>[n,wrap('div')])),
  '@/components/ui/button':{Button:wrap('button')},
 })('src/components/ceo/MonthlyExportDialog.tsx').default;
 const props={employees,year:'2026',initialTypes:['annual'],scope:'QA',ready:true,onClose(){}};
 let tree;await act(async()=>{tree=renderer.create(React.createElement(Component,props));});
 const button=name=>tree.root.findAllByType('button').find(b=>b.props.children===name);
 await act(async()=>button('Clear selection').props.onClick());
 assert.equal(button('Download CSV').props.disabled,true);
 let boxes=tree.root.findAllByType('input').filter(i=>i.props.type==='checkbox');
 await act(async()=>boxes[4].props.onChange({target:{checked:true}}));
 // Report list retains only Bob; Alice still appears in the selection checklist.
 const table=tree.root.findByType('table');
 assert.match(table.findAllByType('td').flatMap(td=>td.children.filter(c=>typeof c==='string')).join(' '),/Bob/);assert.doesNotMatch(table.findAllByType('td').flatMap(td=>td.children.filter(c=>typeof c==='string')).join(' '),/Alice/);
 assert.equal(button('Download CSV').props.disabled,false);
 await act(async()=>tree.update(React.createElement(Component,{...props,ready:false})));
 assert.equal(button('Download CSV').props.disabled,true);
 await act(async()=>tree.unmount());
});

test('overview month, employee and type filters agree with totals while annual quota usage stays full-year',async()=>{
 const wrap=tag=>props=>React.createElement(tag,props,props.children);
 const charts=Object.fromEntries(['Bar','BarChart','CartesianGrid','Cell','LabelList','Legend','ResponsiveContainer','Tooltip','XAxis','YAxis'].map(n=>[n,wrap('chart-'+n)]));
 const Component=loadTS({'recharts':charts,'./MonthlyExportDialog':{default:wrap('export-dialog')},'@/components/ui/popover':Object.fromEntries(['Popover','PopoverContent','PopoverTrigger'].map(n=>[n,wrap(n)])),'@/components/ui/command':Object.fromEntries(['Command','CommandInput','CommandList','CommandEmpty','CommandItem'].map(n=>[n,wrap(n)]))})('src/components/ceo/OverviewDashboard.tsx').default;
 let tree;await act(async()=>{tree=renderer.create(React.createElement(Component,{employees,year:'2026',departmentCount:1,onLeaveToday:[],onSelectEmployee(){},exportReady:true,exportScope:'QA'}));});
 const select=name=>tree.root.findAllByType('select').find(x=>x.props['aria-label']===name);
 await act(async()=>tree.root.findAllByType('CommandItem').find(n=>n.props.value.startsWith('1 ')).props.onSelect());
 await act(async()=>select('Overview month').props.onChange({target:{value:'10'}}));
 await act(async()=>select('Overview leave type').props.onChange({target:{value:'annual'}}));
 const chart=tree.root.findAllByType('chart-BarChart')[0];assert.equal(chart.props.data.length,31);assert.equal(chart.props.data[0].month,'1');assert.equal(chart.props.data.reduce((sum,r)=>sum+r.total,0),1);
 assert.ok(tree.root.findAllByType('p').some(p=>p.props.children==='Full year · top 4 by allowance used'));
 const quotaCard=tree.root.findAll(n=>n.props.title==='Annual leave used')[0];
 assert.ok(quotaCard.findAllByType('span').some(n=>n.children.includes('2')&&n.children.includes('12')));
 await act(async()=>tree.root.findAllByType('CommandItem').find(n=>n.props.value.startsWith('2 ')).props.onSelect());
 assert.equal(tree.root.findAllByType('chart-BarChart')[0].props.data[0].total,0);
 await act(async()=>tree.unmount());
});
