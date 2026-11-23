import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../n8n/sql/074_line_allowlist.sql',import.meta.url),'utf8');
test('LINE only carries approval cards and leave decisions',()=>{
 assert.match(sql,/tbs_approval_request_id\(payload\) IS NOT NULL/);
 assert.match(sql,/\^\(อนุมัติแล้ว \/ Approved\|ไม่อนุมัติ \/ Leave rejected\)/);
 assert.match(sql,/BEFORE INSERT OR UPDATE ON tbs_sync_jobs/);
 assert.match(sql,/NEW\.completed_generation:=NEW\.generation/);
 assert.doesNotMatch(sql,/DELETE FROM tbs_sync_jobs/);
});
