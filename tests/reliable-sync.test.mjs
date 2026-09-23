import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSheet} from '../n8n/js/sheet-projection.mjs';
import loadTS from './load-ts.cjs';
const entry=(date,status='Approved',days=.5)=>({requestId:1,date,type:'annual',days,period:'morning',reason:'Family, appointment',status});
const snapshot={year:2027,names:['Test Person'],quota:{annual_total:12,sick_total:30,personal_total:3},carried:2,known:[entry('2027-01-05')],entries:[entry('2027-01-05'),entry('2027-01-06')]};
const sheet=[['Name: Test Person'],['Start date'],['Date','Sick','Annual','Personal','Reason'],['5-Jan-27','',.5,'','Family (Awaiting approval)'],[],[],['All leave getting per year',30,12,3],['Total taken',0,.5,0],['Total remain',30,11.5,3]];
test('sheet projection uses request year, half-day dates, canonical status and absolute balances',()=>{
 const result=projectSheet(snapshot,sheet);assert.equal(result.valueInputOption,'RAW');assert.match(result.data[0].range,/2027/);
 assert.equal(result.data[0].values[0][2],.5);assert.equal(result.data[0].values[1][2],.5);assert.match(result.data[0].values[0][4],/morning.*Approved/);
 assert.deepEqual(result.data[2].values,[[0,1,0]]);assert.deepEqual(result.data[3].values,[[30,13,3]]);
 const synced=structuredClone(sheet);result.data[0].values.forEach((row,i)=>synced[3+i]=row);
 assert.deepEqual(projectSheet({...snapshot,known:snapshot.entries},synced),result);
});
test('sheet projection never overwrites unknown legacy rows or ambiguous employees',()=>{
 const unknown=structuredClone(sheet);unknown[4]=['7-Jan-27',1,'','','Unreconciled'];assert.throws(()=>projectSheet(snapshot,unknown),/Unreconciled/);
 assert.throws(()=>projectSheet(snapshot,[...sheet,['Name: Test Person']]),/uniquely match/);
});
test('rejection removes the matched rows; changed dates replace the old version',()=>{
 const rejected=projectSheet({...snapshot,entries:[entry('2027-01-05','Rejected')]},sheet);assert.deepEqual(rejected.data[0].values[0],['','','','','']);assert.deepEqual(rejected.data[2].values,[[0,0,0]]);
 const edited=projectSheet({...snapshot,entries:[entry('2027-01-09')]},sheet);assert.equal(edited.data[0].values[0][0],'9-Jan-27');
});
test('zero quota warns for taken leave while a known zero allowance is not missing',()=>{
 const {overQuotaList,awaitingQuota}=loadTS()('src/components/ceo/overviewData.ts');
 const employee={quotasKnown:true,quotas:{annualTotal:0,sickTotal:0,personalTotal:0,carriedOver:0},leaves:[{date:'2026-01-05',type:'sick',days:1,status:'Approved'}]};
 assert.equal(overQuotaList([employee],'2026')[0].over,1);assert.equal(awaitingQuota([employee]).length,0);assert.equal(awaitingQuota([{...employee,quotasKnown:false}]).length,1);
});
test('verified sheet links resolve nicknames and fail closed if the header changes',()=>{
 const linked={...snapshot,names:['Different Fullname'],sheetHeader:'Name: Alice',requireVerifiedLink:true};
 const named=structuredClone(sheet);named[0]=['Name: Alice'];
 assert.equal(projectSheet(linked,named).data.length,4);
 assert.throws(()=>projectSheet({...linked,sheetHeader:null},named),/No verified/);
 assert.throws(()=>projectSheet(linked,sheet),/uniquely match/);
 assert.throws(()=>projectSheet(linked,[...named,['Name: Alice']]),/uniquely match/);
});
test('explicit database authority permits reconciliation but cannot bypass employee identity',()=>{
 const unknown=structuredClone(sheet);unknown[4]=['7-Jan-27',1,'','','Legacy difference'];
 const approved={...snapshot,sheetHeader:'Name: Test Person',requireVerifiedLink:true,databaseAuthoritative:true,sheetName:'TEST TBS033 - Leave 2027'};
 assert.match(projectSheet(approved,unknown).data[0].range,/TEST TBS033/);
 assert.throws(()=>projectSheet({...approved,sheetHeader:'Name: Other Person'},unknown),/uniquely match/);
 assert.throws(()=>projectSheet({...approved,databaseAuthoritative:false},unknown),/Unreconciled/);
});
