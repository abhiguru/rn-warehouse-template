import assert from 'node:assert/strict';
import {navigationConfig,customerReceiptDenialMode,navigationBefore,navigationAfter} from './fixture-navigation-guards.mjs';
export function receiptDenialConfig(c){navigationConfig(c);assert.equal(customerReceiptDenialMode(c),true);assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');return c;}
export function receiptDenialTarget(c,target){receiptDenialConfig(c);assert.deepEqual(target,{id:c.targetReceiptId,record:'FXC702',customer:'Backend Test Customer B',nativeAssigned:false});}
export function receiptDenialPreserved(c,before,after){receiptDenialTarget(c,before.target);receiptDenialTarget(c,after.target);navigationBefore(c,before.snapshot);navigationAfter(c,before.snapshot,after.snapshot);}
export function receiptRpcCounts(text){let successful=0,failed=0;for(const line of text.split('\n')){const m=line.match(/"POST \/rest\/v1\/rpc\/get_grn_details(?:\?[^ ]*)? HTTP\/[\d.]+" (\d{3})\b/);if(m){if(Number(m[1])===200)successful++;else failed++;}}return {successful,failed};}
