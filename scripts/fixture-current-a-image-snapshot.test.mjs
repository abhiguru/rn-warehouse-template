import test from 'node:test';
import assert from 'node:assert/strict';
import {privateDocumentSQL} from './fixture-reciprocal-document-snapshot.mjs';
const c={scope:'isolated-fictional-a-private-image-denial',phone:'919888888872',profileId:'79764e1a-3aed-4cac-9a25-42ccdafb79ac',nativeSessionId:'11111111-1111-4111-8111-111111111111',documentPath:'grn/a24c256a-bdf3-11f1-97aa-57de57b8fb69/11111111-1111-4111-8111-111111111111.pdf'};
test('current image snapshot matches A native session while historical mode retains B',()=>{
 const old=privateDocumentSQL(c);assert.match(old,/'nativeBSessionPresent'/);assert.match(old,/WHERE p.mobile='919888888873' AND s.id=/);
 const current={...c,currentAImageDenial:true,noAutomaticRetry:true,artifactSHA256:'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69'};
 const sql=privateDocumentSQL(current);assert.match(sql,/'nativeASessionPresent'/);assert.match(sql,/WHERE p.mobile='919888888872' AND s.id=/);assert.match(sql,/REPEATABLE READ READ ONLY/);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE)\b/);
 assert.throws(()=>privateDocumentSQL({...current,artifactSHA256:'f'.repeat(64)}));
});
