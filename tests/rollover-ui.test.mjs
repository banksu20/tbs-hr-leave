import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';

test('individual rollover edits survive filtering and failed validation; draft saving never applies quotas',async()=>{
 const calls=[];let fail=false;const stored=new Map();const previous=global.localStorage;
 global.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
 const row=(userId,name)=>({userId,name,nickname:name,empNo:Number(userId),annualTotal:12,sickTotal:30,personalTotal:3,unusedAnnual:12,suggestedCarryover:5,carriedOver:5,expiresOn:'2027-03-31',note:'',status:'Ready'});
 const rows=[row('1','Alice'),row('2','Bob')];
 const Component=loadTS({'@/components/ui/button':{Button:p=>React.createElement('button',p,p.children)},'@/lib/api':{previewRollover:async p=>{calls.push(p);if(fail)throw Error('Refresh required');return {ok:true,targetYear:2027,token:'preview',rows:rows.map(r=>({...r,...p.overrides.find(o=>o.userId===r.userId)}))};}}})('src/components/ceo/YearRollover.tsx').default;
 let view;try{
  await act(async()=>{view=renderer.create(React.createElement(Component,{year:'2026'}));});
  await act(async()=>{view.root.findAllByType('form')[0].props.onSubmit({preventDefault(){}});});
  await act(async()=>{view.root.findByProps({'aria-label':'Carryover for Alice'}).props.onChange({target:{value:'7.5'}});view.root.findByProps({'aria-label':'Rollover note for Alice'}).props.onChange({target:{value:'Exception agreed'}});});
  await act(async()=>view.root.findByProps({'aria-label':'Expiry for Alice'}).props.onChange({target:{value:'2027-06-30'}}));
  await act(async()=>view.root.findByProps({'aria-label':'Default carryover expiry'}).props.onChange({target:{value:'2027-04-30'}}));
  assert.equal(view.root.findByProps({'aria-label':'Rollover note for Alice'}).props.value,'Exception agreed');
  assert.equal(view.root.findByProps({'aria-label':'Carryover for Alice'}).props.value,7.5);
  assert.equal(view.root.findByProps({'aria-label':'Expiry for Alice'}).props.value,'2027-06-30');
  assert.equal(view.root.findByProps({'aria-label':'Expiry for Bob'}).props.value,'2027-04-30');
  await act(async()=>{view.root.findByProps({'aria-label':'Search rollover employees'}).props.onChange({target:{value:'Bob'}});});
  assert.equal(view.root.findAllByProps({'aria-label':'Carryover for Alice'}).length,0);
  await act(async()=>{view.root.findAllByType('form')[1].props.onSubmit({preventDefault(){}});});
  assert.equal(calls.at(-1).overrides[0].carriedOver,7.5);assert.equal(calls.at(-1).overrides[0].note,'Exception agreed');
  fail=true;await act(async()=>{view.root.findAllByType('form')[1].props.onSubmit({preventDefault(){}});});
  assert.equal(view.root.findAllByType('form').length,2);
  const button=view.root.findAllByType('button').find(b=>b.props.children==='Save browser draft');await act(async()=>button.props.onClick({currentTarget:{form:{reportValidity:()=>true}}}));
  const saved=JSON.parse(stored.get('tbs_rollover_preview_v1_2026'));assert.equal(saved.overrides[0].note,'Exception agreed');assert.equal(calls.length,3);
  await act(async()=>view.root.findByProps({'aria-label':'Sick allowance for Bob'}).props.onChange({target:{value:''}}));
  await act(async()=>view.root.findByProps({'aria-label':'Search rollover employees'}).props.onChange({target:{value:'Alice'}}));
  await act(async()=>view.root.findAllByType('form')[1].props.onSubmit({preventDefault(){}}));
  assert.equal(calls.length,3);assert.match(JSON.stringify(view.toJSON()),/valid allowances/);
 }finally{view?.unmount();global.localStorage=previous;}
});

test('rollover requires reviewed edits and confirmation before applying every visible or hidden employee',async()=>{
 let applied;let switched;const rows=[{userId:'1',name:'Alice',annualTotal:12,sickTotal:null,personalTotal:3,sourceAnnual:17,sourceCarried:5,unusedAnnual:8,carriedOver:8,expiresOn:'2027-03-31',status:'Ready'}];
 const Component=loadTS({'@/components/ui/button':{Button:p=>React.createElement('button',p,p.children)},'@/lib/api':{
  previewRollover:async p=>({ok:true,targetYear:2027,token:'checked',rows:rows.map(r=>({...r,...p.overrides.find(o=>o.userId===r.userId)}))}),
  applyRollover:async(p,token)=>{applied={p,token};return {ok:true,saved:1};}
 }})('src/components/ceo/YearRollover.tsx').default;
 let view;try{
  await act(async()=>{view=renderer.create(React.createElement(Component,{year:'2026',onApplied:(year,saved)=>{switched={year,saved};}}));});
  await act(async()=>view.root.findAllByType('form')[0].props.onSubmit({preventDefault(){}}));
  const applyButton=()=>view.root.findAllByType('button').find(b=>Array.isArray(b.props.children)&&b.props.children[0]==='Apply rollover to ');
  assert.equal(applyButton().props.disabled,false);
  await act(async()=>view.root.findByProps({'aria-label':'Annual allowance for Alice'}).props.onChange({target:{value:'15'}}));
  assert.equal(applyButton().props.disabled,true);
  await act(async()=>view.root.findAllByType('form')[1].props.onSubmit({preventDefault(){}}));
  assert.equal(applyButton().props.disabled,false);
  await act(async()=>applyButton().props.onClick());assert.equal(applied,undefined);assert.equal(switched,undefined);
  await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Confirm rollover').props.onClick());
  assert.deepEqual(switched,{year:2027,saved:1});assert.equal(applied.token,'checked');assert.equal(applied.p.overrides[0].annualTotal,15);assert.equal(applied.p.overrides[0].carriedOver,8);assert.equal(applied.p.overrides[0].sickTotal,null);
  assert.equal(view.root.findAllByType('table').length,0);assert.match(JSON.stringify(view.toJSON()),/Rollover complete/);
 }finally{view?.unmount();}
});
