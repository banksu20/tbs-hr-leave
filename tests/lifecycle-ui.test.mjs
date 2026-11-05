import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import renderer,{act} from 'react-test-renderer';import loadTS from './load-ts.cjs';
test('review shows both employee types and only interns need an end date',async()=>{
 const previous=global.fetch;const rows=[{user_id:'staff',first_name:'Full',last_name:'Time',department:'AI',employment_type:'employee'},{user_id:'intern',first_name:'Test',last_name:'Intern',department:'AI',employment_type:'intern'}];
 global.fetch=async()=>({ok:true,json:async()=>({registrations:rows})});
 const Component=loadTS({'@/hooks/useLanguage':{useLanguage:()=>({language:'en'})},'@tanstack/react-query':{useQueryClient:()=>({invalidateQueries:async()=>{}})}})('src/components/ceo/RegistrationReview.tsx').default;
 let view;try{await act(async()=>{view=renderer.create(React.createElement(Component));});
 let buttons=view.root.findAllByType('button').filter(b=>b.props.children==='Review');assert.equal(buttons.length,2);
 await act(async()=>buttons[0].props.onClick());assert.equal(view.root.findAllByType('input').filter(i=>i.props.type==='date').length,1);
 await act(async()=>buttons[1].props.onClick());assert.equal(view.root.findAllByType('input').filter(i=>i.props.type==='date').length,2);
 }finally{await act(async()=>view?.unmount());global.fetch=previous;}
});
test('start date displays a translated missing value instead of inventing one',async()=>{
 for(const language of ['en','th']){const Component=loadTS({'@/hooks/useLanguage':{useLanguage:()=>({language})}})('src/components/ceo/EmployeeStartDate.tsx').default;let view;try{await act(async()=>{view=renderer.create(React.createElement(Component,{date:null}));});assert.match(JSON.stringify(view.toJSON()),language==='th'?/ยังไม่ได้ระบุ/:/Not recorded/);}finally{await act(async()=>view?.unmount());}}
});

test('start date shows pending state and restores the saved date after failure',async()=>{
 const Component=loadTS({'@/hooks/useLanguage':{useLanguage:()=>({language:'en'})}})('src/components/ceo/EditableStartDate.tsx').default;
 let view,rejectSave;
 await act(async()=>{view=renderer.create(React.createElement(Component,{name:'Test',value:'2026-01-01',onSave:()=>new Promise((_,reject)=>{rejectSave=reject;})}));});
 try{
 await act(async()=>view.root.findByType('input').props.onChange({target:{value:'2026-02-01'}}));
 await act(async()=>view.root.findByType('input').props.onBlur());
 assert.equal(view.root.findByType('input').props.disabled,true);
 await act(async()=>rejectSave(new Error('Network failed')));
 assert.equal(view.root.findByType('input').props.value,'2026-01-01');
 assert.equal(view.root.findByType('input').props.disabled,false);
 assert.equal(view.root.findByProps({role:'alert'}).props.children,'Not saved');
 }finally{await act(async()=>view.unmount());}
});
