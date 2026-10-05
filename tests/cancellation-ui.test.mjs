import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';
const stubs={'@/components/ui/button':{Button:p=>React.createElement('button',p,p.children)},'@/hooks/useLanguage':{useLanguage:()=>({language:'en'})},'@line/liff':{default:{init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'sample'}}};
test('CEO retries by rechecking the saved state without automatically repeating the decision',async()=>{
 const oldFetch=global.fetch,oldWindow=global.window;let posts=0,gets=0;let view;
 global.window={location:{search:'?id=1&token=test&action=approve'}};
 global.fetch=async(url,init)=>{if(init.method==='POST'){posts++;throw Error('Temporary network error');}gets++;return new Response(JSON.stringify({request:{id:1,name:'Sample',type:'annual',dates:['2099-12-01'],days:1}}));};
 const Component=loadTS(stubs)('src/pages/CancelDecision.tsx').default;
 try{
 await act(async()=>{view=renderer.create(React.createElement(Component));});
 const button=label=>view.root.findAllByType('button').find(b=>b.props.children===label);
 await act(async()=>button('Confirm cancellation').props.onClick());assert.equal(posts,1);assert.equal(button('Confirm cancellation').props.disabled,true);
 await act(async()=>button('Refresh status and retry').props.onClick());assert.equal(posts,1);assert.equal(gets,2);assert.equal(button('Confirm cancellation').props.disabled,false);
 }finally{view?.unmount();global.fetch=oldFetch;global.window=oldWindow;}
});
test('employee history keeps newest date on top while offering cancellation on latest eligible entry',async()=>{
 const oldFetch=global.fetch;let view;
 global.fetch=async()=>new Response(JSON.stringify({requests:[{id:2,status:'Rejected',type:'annual',days:1,dates:['2099-12-02'],cancellation:null},{id:1,status:'Approved',type:'annual',days:1,dates:['2099-12-01'],cancellation:null},{id:3,status:'Approved',type:'annual',days:1,dates:['2020-01-01'],cancellation:null}]}));
 const Component=loadTS(stubs)('src/components/EmployeeCancellations.tsx').default;
 try{
 await act(async()=>{view=renderer.create(React.createElement(Component,{userId:'test',onChanged(){}}));});
 assert.equal(view.root.findAllByType('article').length,1);
 await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Show one more').props.onClick());
 const articles=view.root.findAllByType('article');assert.equal(articles[0].findAllByType('button').length,0);assert.equal(articles[1].findAllByType('button').length,1);
 }finally{view?.unmount();global.fetch=oldFetch;}
});
