import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { receiptConfig, receiptSnapshotSQL, receiptSnapshotShape } from './fixture-receipt-snapshot.mjs';
const c={scope:'isolated-fictional-receipt-observation',kind:'receipt',record:'FXF501',instanceId:'11111111-1111-4111-8111-111111111111',customerId:'22222222-2222-4222-8222-222222222222',itemId:'33333333-3333-4333-8333-333333333333',artifactSHA256:'a'.repeat(64),fixtureGuardSHA256:'b'.repeat(64),phase:'before-upstream',quantity:4,weight:10};
test('receipt observation refuses foreign scope, identifiers, keys and unbounded fictional inputs',()=>{
 receiptConfig(c);
 for(const edit of [{scope:'production'},{kind:'dispatch'},{record:"FXF501';DELETE"},{customerId:'wrong'},{itemId:'wrong'},{quantity:0},{quantity:51},{quantity:1.5},{weight:0},{weight:1001},{phase:'retry'}])assert.throws(()=>receiptConfig({...c,...edit}));
 assert.throws(()=>receiptSnapshotSQL(c,'warehouse-dispatch-'+'c'.repeat(64)));
});
test('receipt SQL is readonly, uses the real nested cache result and binds its item/customer',()=>{
 const sql=receiptSnapshotSQL(c,'warehouse-grn-'+'c'.repeat(64));assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/statement_timeout='10s'/);assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/);assert.match(sql,/response#>>'\{data,grn_id\}'/);
 receiptSnapshotShape(c,{wrongCustomer:0,wrongItem:0,images:0});
 for(const edit of [{wrongCustomer:1},{wrongItem:1},{images:1}])assert.throws(()=>receiptSnapshotShape(c,{wrongCustomer:0,wrongItem:0,images:0,...edit}));
});

test('native receipt controls refuse submissions in draft and enforce reconciliation before one retry', () => {
  for (const name of ['test_receipt_draft_controls.py','test_receipt_case_controls.py','test_receipt_image_controls.py']) {
    const r=spawnSync('python3',[fileURLToPath(new URL('./fixture-ui/'+name,import.meta.url))],{encoding:'utf8',timeout:10000});
    assert.equal(r.status,0,r.stderr);
  }
});

test('deferred book image is absent before retry and must bind exactly one confirmed object afterward', async () => {
  const {receiptImageCommitted,receiptCoreSnapshot}=await import('./fixture-receipt-snapshot.mjs');
  const config={...c,phase:'after-upstream-success',imagePolicy:'deferred-single-book-image'};
  const id='11111111-1111-4111-8111-111111111111';
  const s={wrongCustomer:0,wrongItem:0,images:1,headerIds:[id],imageDetails:[{id,grnId:id,itemId:null,type:'header',status:'confirmed',path:'headers/'+id+'/fictional.webp',fileSize:100,mimeType:'image/webp'}],imageObjects:[{id,name:'headers/'+id+'/fictional.webp',size:'100',mimeType:'image/webp'}]};
  receiptImageCommitted(config,s);receiptSnapshotShape(config,s,'after-retry');
  assert.throws(()=>receiptSnapshotShape(config,s,'after-loss'));
  assert.throws(()=>receiptConfig({...config,phase:'before-upstream'}));
  for(const edit of [{status:'pending'},{grnId:c.customerId},{type:'item'},{path:'headers/other/fictional.webp'},{fileSize:0}])assert.throws(()=>receiptImageCommitted(config,{...s,imageDetails:[{...s.imageDetails[0],...edit}]}));
  assert.throws(()=>receiptImageCommitted(config,{...s,imageObjects:[]}));
  assert.deepEqual(receiptCoreSnapshot(s),{wrongCustomer:0,wrongItem:0,headerIds:[id]});
  const sql=receiptSnapshotSQL(config);assert.match(sql,/bucket_id='grn-images'/);assert.doesNotMatch(sql,/upload_token/);
});

test('actual stored image bytes add one bound object and preserve every older file', async () => {
  const {receiptStoredImageBytes}=await import('./fixture-receipt-snapshot.mjs');
  const config={...c,phase:'after-upstream-success',imagePolicy:'deferred-single-book-image'};
  const id=c.instanceId,path='headers/'+id+'/fictional.webp',version=c.customerId;
  const old={size:50,sha256:'a'.repeat(64)},added={size:100,sha256:'b'.repeat(64)};
  const before={storedFiles:{'old/object':old}};
  const after={headerIds:[id],imageDetails:[{id,grnId:id,itemId:null,type:'header',status:'confirmed',path,fileSize:100,mimeType:'image/webp'}],imageObjects:[{id,name:path,size:'100',mimeType:'image/webp'}],storedFiles:{'old/object':old,['stub/stub/grn-images/'+path+'/'+version]:added}};
  assert.equal(receiptStoredImageBytes(config,before,after).sha256,added.sha256);
  assert.throws(()=>receiptStoredImageBytes(config,before,{...after,storedFiles:{...after.storedFiles,'old/object':added}}));
  assert.throws(()=>receiptStoredImageBytes(config,before,{...after,storedFiles:{...after.storedFiles,'extra/object':added}}));
  assert.throws(()=>receiptStoredImageBytes(config,before,{...after,storedFiles:{'old/object':old,'wrong/path':added}}));
});
