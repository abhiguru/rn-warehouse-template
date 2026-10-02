import test from 'node:test';import assert from 'node:assert/strict';
import {invoiceDenialConfig,invoiceDenialTarget,invoiceDenialPreserved,invoiceRpcCounts} from './fixture-invoice-denial-controls.mjs';
const c={scope:'isolated-fictional-navigation-case',case:'same-server',kind:'native-invoice-denial',customerBInvoiceDenial:true,profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',profileName:'Customer B',sessionId:'00000000-0000-4000-8000-000000000001',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',targetInvoiceId:'b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',fixtureGuardSHA256:'a'.repeat(64),backendCheckout:'/owned/backend',backendState:'/owned/state',soakConfig:'/private/ui',artifactAudit:'/private/audit',caseDirectory:'/private/new'};
test('invoice denial binds genuine B customer and existing A invoice with preserved native state',()=>{
 invoiceDenialConfig(c);const target={id:c.targetInvoiceId,number:20261010,customer:'Backend Test Customer A',nativeAssigned:false};invoiceDenialTarget(c,target);
 for(const edit of [{profileName:'New customer'},{profileId:c.instanceId},{targetInvoiceId:c.sessionId},{case:'confirm-switch'},{reciprocalCustomerReceiptDenial:true},{reservedCustomerPDF:true},{origin:'https://foreign.example'},{artifactSHA256:'b'.repeat(64)}])assert.throws(()=>invoiceDenialConfig({...c,...edit}));
 assert.throws(()=>invoiceDenialTarget(c,{...target,nativeAssigned:true}));assert.throws(()=>invoiceDenialTarget(c,{...target,customer:'Backend Test Customer B'}));
 const snapshot={profile:{id:c.profileId,name:c.profileName,role:'customer',active:true},nativeSessionPresent:true,otpCount:7,businessHash:'c'.repeat(64),otherAuthHash:'d'.repeat(64)};invoiceDenialPreserved(c,{snapshot,target},{snapshot,target});assert.throws(()=>invoiceDenialPreserved(c,{snapshot,target},{snapshot:{...snapshot,profile:{...snapshot.profile,active:false}},target}));
});
test('invoice RPC evidence includes only matching status counts and strips request queries',()=>{
 const raw='"POST /rest/v1/rpc/get_invoice_data?private=request HTTP/1.1" 200\n"POST /rest/v1/rpc/get_grn_details HTTP/1.1" 200';assert.deepEqual(invoiceRpcCounts(raw),{successful:1,failed:0});assert.doesNotMatch(JSON.stringify(invoiceRpcCounts(raw)),/private|request/);
});
