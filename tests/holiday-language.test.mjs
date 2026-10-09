import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer,{act} from 'react-test-renderer';
import loadTS from './load-ts.cjs';
test('company holidays switch title, dates and names with the app language',async()=>{
 const oldFetch=global.fetch;let language='en',view;
 global.fetch=async()=>new Response(JSON.stringify({confirmed:true,holidays:[{date:'2026-10-23',name:'Chulalongkorn Day',localName:'วันปิยมหาราช'}]}));
 const box=p=>React.createElement('div',null,p.children);
 const Component=loadTS({'@/hooks/useLanguage':{useLanguage:()=>({language})},'@/components/ui/dialog':{Dialog:box,DialogContent:box,DialogHeader:box,DialogTitle:box}})('src/components/HolidaysModal.tsx').default;
 try{
  await act(async()=>{view=renderer.create(React.createElement(Component,{open:true,onOpenChange(){}}));});
  let output=JSON.stringify(view.toJSON());assert.match(output,/Company holidays/);assert.match(output,/Chulalongkorn Day/);assert.match(output,/Oct/);assert.doesNotMatch(output,/วันปิยมหาราช/);
  language='th';await act(async()=>view.update(React.createElement(Component,{open:true,onOpenChange(){}})));
  output=JSON.stringify(view.toJSON());assert.match(output,/ปฏิทินวันหยุด/);assert.match(output,/วันปิยมหาราช/);assert.doesNotMatch(output,/Chulalongkorn Day/);
 }finally{view?.unmount();global.fetch=oldFetch;}
});
