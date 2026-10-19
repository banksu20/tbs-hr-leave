import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
const {leaveErrorMessage}=loadTS()('src/lib/leaveErrorMessage.ts');
const {translations}=loadTS()('src/hooks/language-context.ts');
test('Thai and English dictionaries have the same non-empty keys',()=>{
 assert.deepEqual(Object.keys(translations.th).sort(),Object.keys(translations.en).sort());
 for(const lang of ['th','en'])for(const value of Object.values(translations[lang]))assert(value.trim());
});
test('common leave failures are actionable in both languages',()=>{
 for(const message of ['Overlapping leave exists.','The request deadline has passed.','Internship dates or leave allowance do not cover this request.','HR must configure your internship dates first.','Insufficient annual leave','Please enter a reason','Leave cannot be requested for past dates.','Please reopen this app in LINE and sign in.','Could not check your leave balance.','Failed to fetch','Could not load cancellations']){
  assert.match(leaveErrorMessage(message,'th'),/[ก-๙]/);
  assert(!/[ก-๙]/.test(leaveErrorMessage(message,'en')));
 }
 assert.match(leaveErrorMessage('Overlapping leave exists.','en'),/half-day/);
 assert.equal(leaveErrorMessage('Unexpected reference ABC','th'),'Unexpected reference ABC');
});
