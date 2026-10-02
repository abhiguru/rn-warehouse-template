import test from 'node:test';
import assert from 'node:assert/strict';
import { realtimeSnapshotSQL } from './fixture-realtime-snapshot.mjs';
const id='00000000-0000-4000-8000-000000000001';
const c=()=>({scope:'isolated-fictional-native-realtime',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',callerPhone:'919888888872',orderId:'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0',record:'FXC701',quantities:[1,2],manualRefreshDuringObservation:false,sessionId:id,stockLineId:id,customerId:id,callerProfileId:id,soakConfig:'/private/ui',caseDirectory:'/private/new',prerequisiteEvidence:'/private/proof',otpSocket:'/private/socket'});
test('Realtime snapshot is read-only and excludes only exact target records from business digest',()=>{
 const sql=realtimeSnapshotSQL(c());assert.match(sql,/REPEATABLE READ READ ONLY/);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|TRUNCATE)\b/);
 assert.match(sql,/WHERE id<>'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0'/);assert.match(sql,/WHERE order_id<>'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0'/);
 for(const t of ['dispatch_images','idempotency_keys','enrollment_tokens','otp_rate_limits','storage.objects'])assert.ok(sql.includes(t));
 assert.match(sql,/callerSessions/);assert.match(sql,/rowHash/);
 assert.throws(()=>realtimeSnapshotSQL({...c(),callerProfileId:"x';DELETE"}));
});
