import assert from 'node:assert/strict';
export function concurrencyConfig(c){
 const exact={scope:'isolated-fictional-native-dispatch-concurrency',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',artifactSHA256:'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',competitorProfileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',customerId:'a823809c-bdb6-11f1-b1be-47a66d90b06d',record:'FXQ994',competitorRecord:'FXQ995',sourceReceipt:'FXQ993',sourceQuantity:3,quantity:2,expectedStock:3};
 for(const [k,v] of Object.entries(exact))assert.equal(c[k],v,'CONCURRENCY_BINDING_REQUIRED:'+k);
 for(const k of ['lotId','sourceGRNId','sessionId'])assert.match(c[k],/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
 assert.notEqual(c.lotId,'a248cdd4-bdf3-11f1-97a9-efb90ed37151','Fresh isolated stock required');
 return c;
}
export function concurrencyTransportProof(c,events){
 concurrencyConfig(c);assert.ok(Array.isArray(events)&&events.length===2,'Exactly one bounded request hold required');
 assert.deepEqual(events.map(e=>e.event),['dispatch-request-delay-start','dispatch-request-delay-release']);
 for(const e of events){assert.equal(e.delayMs,5000);assert.ok(Number.isFinite(e.monotonicMs));}
 const elapsed=events[1].monotonicMs-events[0].monotonicMs;assert.ok(elapsed>=4900&&elapsed<=6500,'Bounded actual transport timing required');
 return {status:'PASS',scope:'transport timing only; native and SQL reconciliation required'};
}
export function concurrencyStockProof(c,before,after){
 concurrencyConfig(c);assert.equal(before.stock,3);assert.equal(after.stock,1);
 assert.equal(before.nativeRecordCount,0);assert.equal(before.competitorRecordCount,0);
 assert.equal(after.nativeRecordCount,0);assert.equal(after.competitorRecordCount,1);
 assert.equal(after.dispatchQuantity,2);assert.equal(after.movementCount,1);assert.equal(after.movementBefore,3);assert.equal(after.movementAfter,1);assert.equal(after.successfulCacheCount,1);
 for(const key of ['unrelatedRowsHash','authHash','storageHash']){assert.match(before[key],/^[a-f0-9]{64}$/);assert.equal(after[key],before[key]);}
 assert.equal(after.nativeSessionPresent,true);assert.equal(before.lotBound,true);assert.equal(after.lotBound,true);assert.match(before.lotMetadataHash,/^[a-f0-9]{64}$/);assert.equal(after.lotMetadataHash,before.lotMetadataHash);
 assert.equal(after.dispatches.length,1);const d=after.dispatches[0];assert.equal(d.disp_no,c.competitorRecord);assert.equal(d.customer_id,c.customerId);assert.equal(d.created_by,c.competitorProfileId);assert.equal(d.source_order_id,null);assert.equal(d.deleted_at,null);
 assert.equal(after.lines.length,1);const l=after.lines[0];assert.equal(l.disp_id,d.id);assert.equal(l.gr_id,c.sourceGRNId);assert.equal(l.gr_trl_id,c.lotId);assert.equal(l.disp_qty,2);
 return {status:'PASS',scope:'one competitor commit and native stale-stock rejection; UI/HTTP evidence required separately'};
}
