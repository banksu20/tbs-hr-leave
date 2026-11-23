import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('email decision endpoint is routed without LINE sign-in',()=>{
 assert.match(JSON.parse(read('vercel.json')).routes[0].src,/email-decision\|/);
 assert.match(read('api/[policy].ts'),/'email-decision':emailDecision/);
 assert.doesNotMatch(read('api/_handlers/email-decision.ts'),/verifyLineIdentity/);
 assert.match(read('src/App.tsx'),/pathname==='\/email-decision'\|\|/);
});
test('email fallback only triggers on the LINE monthly limit and keeps links single-use',()=>{
 const sql=read('n8n/sql/073_email_approval_fallback.sql');
 assert.match(sql,/error_message ILIKE '%\(429\)%monthly limit%'/);
 assert.match(sql,/token_hash text NOT NULL UNIQUE/);
 assert.match(sql,/used_at IS NOT NULL THEN RETURN jsonb_build_object\('ok',false,'statusCode',409/);
 assert.match(sql,/tbs_html\(r\.reason\)/);
 assert.doesNotMatch(sql,/@gmail\.com/);
});
test('email decision page removes the token from the address bar',()=>{
 const page=read('src/pages/EmailDecision.tsx');
 assert.match(page,/params\.delete\('t'\)/);
 assert.match(page,/no-referrer/);
});
