import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import * as ReactQuery from '@tanstack/react-query';
const { QueryClient, QueryClientProvider } = ReactQuery;
import loadTS from './load-ts.cjs';

const load = loadTS();
const auth = load('api/_lib/auth.ts');
const http = load('api/_lib/http.ts');

test('password session can write with CEO_API_TOKEN configured, without exposing the token', () => {
  const before = {...process.env};
  try {
    process.env.CEO_PASSWORD='local-test-password'; process.env.CEO_API_TOKEN='local-test-token';
    const cookie=auth.sessionCookie(false).split(';')[0];
    assert.equal(http.writesAllowed({headers:{cookie}}),true);
    assert.equal(http.writesAllowed({headers:{}}),false);
    assert.equal(http.ceoAuthorised({headers:{}}),false);
    delete process.env.CEO_PASSWORD; process.env.NODE_ENV='production';
    assert.equal(auth.signedIn(cookie),false);
    assert.equal(auth.verifyPassword(''),false);
  } finally {
    for(const key of ['CEO_PASSWORD','CEO_API_TOKEN','NODE_ENV']) {
      if(before[key]===undefined) delete process.env[key]; else process.env[key]=before[key];
    }
  }
});

test('n8n receives a server-only secret; empty and rejected writes are not success', async () => {
  const savedFetch=global.fetch, savedSecret=process.env.CEO_WEBHOOK_SECRET;
  process.env.CEO_WEBHOOK_SECRET='test-only-server-secret';
  const n8n=loadTS()('api/_lib/n8nClient.ts');
  try {
    global.fetch=async (_url, options)=>{
      assert.equal(options.headers['x-ceo-webhook-secret'],'test-only-server-secret');
      return new Response(JSON.stringify([{ok:false,statusCode:409,error:'Request dates changed'}]));
    };
    await assert.rejects(n8n.n8nPost('dashboard-leave-update',{}),error=>error.status===409);
    global.fetch=async()=>new Response('[]');
    await assert.rejects(n8n.n8nPost('dashboard-leave-create',{}),/did not confirm/);
  } finally {
    global.fetch=savedFetch;
    if(savedSecret===undefined) delete process.env.CEO_WEBHOOK_SECRET; else process.env.CEO_WEBHOOK_SECRET=savedSecret;
  }
});

test('year switch never copies previous-year data into the new cache, including failed fetch', async () => {
  const memory=new Map();
  global.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  let rejectNewYear;
  class ApiError extends Error {}
  class NetworkError extends Error {}
  const hook=loadTS({'@tanstack/react-query':ReactQuery,'@/lib/api':{
    ApiError,NetworkError,
    fetchEmployees: async year=> year==='2026' ? {employees:[{id:'employee',leaves:[{date:'2026-12-31'}]}],partial:false} : new Promise((resolve,reject)=>{rejectNewYear=reject;}),
  }})('src/hooks/useEmployeesData.ts');
  let state;
  function Component({year}) {state=hook.useEmployeesData(year);return null;}
  const client=new QueryClient({defaultOptions:{queries:{retryDelay:0}}});
  const view=year=>React.createElement(QueryClientProvider,{client},React.createElement(Component,{year}));
  let tree;
  await act(async()=>{tree=renderer.create(view('2026'));});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  assert.equal(state.employees.length,1);
  await act(async()=>{tree.update(view('2027'));});
  assert.deepEqual(state.employees,[]);
  assert.equal(memory.has('tbs_employees_v2_2027'),false);
  await act(async()=>{rejectNewYear(new NetworkError('offline'));await new Promise(resolve=>setTimeout(resolve,20));});
  await act(async()=>{rejectNewYear(new NetworkError('offline'));await new Promise(resolve=>setTimeout(resolve,20));});
  assert.deepEqual(state.employees,[]);assert.equal(memory.has('tbs_employees_v2_2027'),false);
  await act(async()=>tree.unmount());client.clear();delete global.localStorage;
});

test('failed request save retains form data and does not close the editor',async()=>{
  const wrap=(tag)=>(props)=>React.createElement(tag,props,props.children);
  const component=loadTS({
    '@/components/ui/dialog':Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(name=>[name,wrap('div')])),
    '@/components/ui/button':{Button:wrap('button')},
    '@/components/ui/input':{Input:wrap('input')},
  })('src/components/ceo/LeaveRecordDialog.tsx').default;
  let closed=false, tree;
  const initial={scope:'request',expectedDates:['2026-12-31'],dates:['2026-12-31'],type:'annual',daysPerDate:1,halfDayPeriod:null,note:'Keep this note',status:'Approved'};
  await act(async()=>{tree=renderer.create(React.createElement(component,{initial,employeeName:'Test',onClose:()=>{closed=true;},onSave:async()=>{throw Error('offline');}}));});
  await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(closed,false);
  assert.equal(tree.root.findByType('input').props.value,'Keep this note');
  assert.equal(tree.root.findByType('textarea').props.value,'2026-12-31');
  assert.match(tree.root.findByProps({role:'alert'}).children.join(''),/Not saved/);
  await act(async()=>tree.unmount());
});
