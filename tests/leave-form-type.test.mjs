import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
const {leaveFormType}=loadTS()('src/lib/leaveFormType.ts');
test('leave form supports university and annual deep links without losing other types',()=>{
 for(const type of ['sick','personal','university','vacation'])assert.equal(leaveFormType(type),type);
 assert.equal(leaveFormType('annual'),'vacation');
 assert.equal(leaveFormType('unknown'),'');
});
