import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';
test('language saves retry HTTP failures, time out hangs, and changing language cancels stale work',async()=>{
 const original={fetch:global.fetch,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
 const timers=new Map(),calls=[],notices=[];let sequence=0,view,language='en',hang=false;
 global.setTimeout=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;};global.clearTimeout=id=>timers.delete(id);
 global.fetch=async(_,options)=>{calls.push(JSON.parse(options.body));if(hang)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))));return {ok:calls.length>1};};
 const {useNotificationLanguage}=loadTS({'@/hooks/useLanguage':{useLanguage:()=>({language})},'@line/liff':{default:{getAccessToken:()=> 'test-token'}},sonner:{toast:{error:m=>notices.push(m),success:m=>notices.push(m)}}})('src/hooks/useNotificationLanguage.ts');
 const Component=()=>{useNotificationLanguage('emp');return null;};
 const tick=async ms=>{const next=[...timers.entries()].find(([,t])=>t.ms===ms);assert.ok(next,`Timer ${ms} exists`);timers.delete(next[0]);await act(async()=>next[1].fn());};
 try{
  await act(async()=>{view=renderer.create(React.createElement(Component));});assert.equal(calls.length,1);
  await tick(2000);assert.equal(calls.length,2);assert.equal(calls[0].changedAt,calls[1].changedAt);
  hang=true;language='th';await act(async()=>view.update(React.createElement(Component)));assert.equal(calls.at(-1).language,'th');
  await tick(10000);assert.ok([...timers.values()].some(t=>t.ms===2000));
  hang=false;language='en';await act(async()=>view.update(React.createElement(Component)));assert.equal(calls.at(-1).language,'en');assert.equal(timers.size,0);
  assert.ok(calls.at(-1).changedAt>calls[0].changedAt);
 }finally{await act(async()=>view?.unmount());Object.assign(global,original);}
});
test('employee acknowledgement responds to app language; CEO remains English; failed save can retry',async()=>{
 const oldFetch=global.fetch,oldWindow=global.window;let view,language='en',audience='employee',fail=true,posts=0;
 global.window={location:{search:'?id=00000000-0000-4000-8000-000000000001&token=00000000-0000-4000-8000-000000000002'}};
 global.fetch=async(_,options)=>{if(options.method==='POST'){posts++;if(fail)return new Response(JSON.stringify({error:'Temporary error'}),{status:503});return new Response(JSON.stringify({ok:true}));}return new Response(JSON.stringify({acknowledged:false,name:'Sample',total:13,threshold:10,year:2026,language:'en',audience,accountId:'emp'}));};
 const Component=loadTS({'@/lib/liffConfig':{LIFF_ID:'sample'},'@/hooks/useLanguage':{useLanguage:()=>({language})},'@/hooks/useNotificationLanguage':{useNotificationLanguage:()=>{}},'@/components/ui/button':{Button:p=>React.createElement('button',p,p.children)},'@line/liff':{default:{init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getAccessToken:()=> 'sample'}}})('src/pages/SickAcknowledgement.tsx').default;
 try{
  await act(async()=>{view=renderer.create(React.createElement(Component));});
  const button=label=>view.root.findAllByType('button').find(b=>b.props.children===label);
  assert.ok(button('Acknowledge'));language='th';await act(async()=>view.update(React.createElement(Component)));assert.ok(button('รับทราบ'));
  await act(async()=>button('รับทราบ').props.onClick());assert.equal(posts,1);assert.equal(button('รับทราบ').props.disabled,false);
  fail=false;await act(async()=>button('รับทราบ').props.onClick());assert.equal(posts,2);assert.match(JSON.stringify(view.toJSON()),/รับทราบแล้ว/);
  await act(async()=>view.unmount());audience='ceo';await act(async()=>{view=renderer.create(React.createElement(Component));});assert.ok(button('Acknowledge'));assert.equal(button('รับทราบ'),undefined);
 }finally{await act(async()=>view?.unmount());global.fetch=oldFetch;global.window=oldWindow;}
});
