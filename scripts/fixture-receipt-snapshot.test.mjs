import test from 'node:test';
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
