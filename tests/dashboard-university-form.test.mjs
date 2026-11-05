import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';
const wrap=tag=>props=>React.createElement(tag,props,props.children);
const dialogMock=Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(n=>[n,wrap('div')]));
test('university form allows no evidence and sends an optional attachment with the leave, in both languages',async()=>{
 const previous=global.FileReader;
 global.FileReader=class{readAsDataURL(){this.result='data:application/pdf;base64,JVBERi0xLjQ=';this.onload();}};
 try{for(const language of ['en','th']){
  const Component=loadTS({'@/hooks/useLanguage':{useLanguage:()=>({language})},'@/components/ui/dialog':dialogMock,'@/components/ui/input':{Input:wrap('input')},'@/components/ui/button':{Button:wrap('button')}})('src/components/ceo/LeaveRecordDialog.tsx').default;
  let saved,closed=false,view;
  const initial={scope:'request',expectedDates:[],dates:['2099-02-01'],type:'university',daysPerDate:1,halfDayPeriod:null,note:'',status:'Approved'};
  await act(async()=>{view=renderer.create(React.createElement(Component,{creating:true,initial,employeeName:'Test',onClose:()=>{closed=true;},onSave:async value=>{saved=value;}}));});
  await act(async()=>{await view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(saved.evidence,undefined);assert.equal(saved.note,'');assert.equal(closed,true);
  const input=view.root.findAllByType('input').find(i=>i.props.type==='file');assert.ok(!input.props.required);
  await act(async()=>input.props.onChange({target:{files:[{name:'event.pdf',type:'application/pdf',size:20}]}}));
  await act(async()=>{await view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(saved.evidence.filename,'event.pdf');assert.equal(saved.evidence.content,'JVBERi0xLjQ=');assert.equal(closed,true);
  await act(async()=>view.unmount());
 }}finally{global.FileReader=previous;}
});
