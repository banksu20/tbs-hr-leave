import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import loadTS from './load-ts.cjs';
const {overQuotaDays}=loadTS({})('src/lib/overQuota.ts');
const {default:Notice}=loadTS({})('src/components/OverQuotaNotice.tsx');
test('excess uses signed remaining including carryover and fractional allowances',()=>{
 assert.equal(overQuotaDays(-1),1);assert.equal(overQuotaDays(-0.45),.45);
 for(const value of [null,undefined,NaN,0,2])assert.equal(overQuotaDays(value),0);
 assert.equal(overQuotaDays(-2,false),0);assert.equal(overQuotaDays(-2,true,true),0);
});
test('Thai and English labels render only confirmed excess, never while loading',()=>{
 const render=p=>renderToStaticMarkup(React.createElement(Notice,{remaining:-1,configured:true,unlimited:false,loading:false,language:'en',...p}));
 assert.match(render({}),/Over quota: 1 day</);assert.match(render({language:'th'}),/เกินโควตา 1 วัน/);
 assert.match(render({remaining:-1.5}),/Over quota: 1.5 days/);
 for(const props of [{loading:true},{unlimited:true},{configured:false},{remaining:0},{remaining:null}])assert.equal(render(props),'');
});
