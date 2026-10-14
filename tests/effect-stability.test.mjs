import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';

test('holiday edits remain in the form until explicit refresh and year changes fetch the new calendar',async()=>{
 const oldFetch=global.fetch;let view;const reads=[];
 global.fetch=async url=>{reads.push(String(url));return new Response(JSON.stringify({holidays:[{date:'2026-10-23',name:'Saved holiday'}],revision:'sample',confirmed:true}));};
 const Component=loadTS()('src/components/ceo/CompanyCalendar.tsx').default;
 try {
  await act(async()=>{view=renderer.create(React.createElement(Component));});
  assert.equal(reads.length,1);
  await act(async()=>view.root.findByProps({'aria-label':'Holiday 1 English name'}).props.onChange({target:{value:'Draft name'}}));
  assert.equal(reads.length,1,'typing must not reload and overwrite the draft');
  assert.equal(view.root.findByProps({'aria-label':'Holiday 1 English name'}).props.value,'Draft name');
  await act(async()=>view.root.findByProps({'aria-label':'Calendar year'}).props.onChange({target:{value:'2027'}}));
  assert.equal(reads.length,2);assert.match(reads[1],/year=2027$/);
  await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Refresh').props.onClick());
  assert.equal(reads.length,3);
 } finally {view?.unmount();global.fetch=oldFetch;}
});

test('quota loads once per employee and explicit refresh, not on ordinary renders',async()=>{
 let calls=0,latest,view;
 const {useLeaveQuota}=loadTS({'@/lib/employeeData':{employeeData:async()=>{calls++;return {remainingDays:5};}}})('src/hooks/useLeaveQuota.ts');
 function Probe({userId}) {latest=useLeaveQuota(userId);return React.createElement('div',null,latest.remainingDays);}
 try {
  await act(async()=>{view=renderer.create(React.createElement(Probe,{userId:'first'}));});
  assert.equal(calls,1);assert.equal(latest.remainingDays,5);
  await act(async()=>view.update(React.createElement(Probe,{userId:'first'})));
  assert.equal(calls,1);
  await act(async()=>view.update(React.createElement(Probe,{userId:'second'})));
  assert.equal(calls,2);
  await act(async()=>latest.refetch());assert.equal(calls,3);
 } finally {view?.unmount();}
});
