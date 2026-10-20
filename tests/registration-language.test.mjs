import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';
const wrap=tag=>p=>React.createElement(tag,p,p.children);
function setup(language,fail=false){return loadTS({
 '@/hooks/useLanguage':{useLanguage:()=>({language})},
 '@/image/TBS-Logo.png':'logo',
 '@/components/ui/button':{Button:wrap('button')},
 '@/components/ui/input':{Input:wrap('input')},
 '@/components/ui/card':Object.fromEntries(['Card','CardContent','CardHeader','CardDescription'].map(k=>[k,wrap('div')])),
 '@line/liff':{default:{init:async()=>{if(fail)throw Error('test');},isLoggedIn:()=>true}}
})('src/components/ProfileSetup.tsx').default;}
test('registration renders named fields and submission in the chosen language',async()=>{
 for(const [language,name,submit] of [['en','First name','Submit registration'],['th','ชื่อจริง','ส่งข้อมูลสมัคร']]){
 const Component=setup(language);let tree;await act(async()=>{tree=renderer.create(React.createElement(Component,{defaultName:'',onSave:()=>{}}));});
 assert.equal(tree.root.findAll(n=>n.type==='input'&&n.props['aria-label']===name).length,1);
 assert.match(JSON.stringify(tree.toJSON()),new RegExp(submit));
 if(language==='en')assert.doesNotMatch(JSON.stringify(tree.toJSON()),/ชื่อจริง|เลือกแผนก|ส่งข้อมูลสมัคร/);
 tree.unmount();
 }
});
test('failed LINE initialization shows an actionable error rather than an endless spinner',async()=>{
 const Component=setup('en',true);let tree;const old=console.error;console.error=()=>{};
 try{await act(async()=>{tree=renderer.create(React.createElement(Component,{defaultName:'',onSave:()=>{}}));});}finally{console.error=old;}
 assert.match(JSON.stringify(tree.toJSON()),/Unable to connect to LINE/);assert.match(JSON.stringify(tree.toJSON()),/Try again/);tree.unmount();
});
test('language changes propagate between open screens without remounting forms',async()=>{
 const oldWindow=global.window,oldStorage=global.localStorage;let listener,removed=false;
 global.localStorage={getItem:()=> 'en',setItem:()=>{}};
 global.window={addEventListener:(name,fn)=>{if(name==='storage')listener=fn;},removeEventListener:()=>{removed=true;}};
 const Context=React.createContext(null);const Provider=loadTS({'./language-context':{LanguageContext:Context,translations:{en:{},th:{}}}})('src/hooks/LanguageProvider.tsx').LanguageProvider;
 let tree;function Child(){return React.createElement('span',null,React.useContext(Context).language);}
 try{await act(async()=>{tree=renderer.create(React.createElement(Provider,null,React.createElement(Child)));});
 await act(async()=>listener({key:'app_language',newValue:'th'}));assert.equal(tree.root.findByType('span').children[0],'th');
 await act(async()=>listener({key:'app_language',newValue:'invalid'}));assert.equal(tree.root.findByType('span').children[0],'th');
 await act(async()=>tree.unmount());assert.equal(removed,true);
 }finally{global.window=oldWindow;global.localStorage=oldStorage;}
});
