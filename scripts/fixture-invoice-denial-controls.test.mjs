import test from 'node:test';import assert from 'node:assert/strict';
import {navigationSnapshotSQL} from './fixture-navigation-guards.mjs';
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

test('reciprocal receipt and invoice SQL bind the actual B phone with its B profile',()=>{
 const invoiceSQL=navigationSnapshotSQL(c);assert.ok(invoiceSQL.includes("WHERE id='"+c.profileId+"' AND mobile='919888888873'"));assert.ok(!invoiceSQL.includes("AND mobile='919888888874'"));
 const receipt={...c,kind:'native-reciprocal-receipt-denial',reciprocalCustomerReceiptDenial:true,targetReceiptId:'a2489c56-bdf3-11f1-97a8-8b3d06ae4c97'};delete receipt.customerBInvoiceDenial;delete receipt.targetInvoiceId;
 assert.ok(navigationSnapshotSQL(receipt).includes("WHERE id='"+c.profileId+"' AND mobile='919888888873'"));
 const reserved={...receipt,kind:'native-receipt-denial',reservedCustomerReceiptDenial:true,profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',targetReceiptId:'a24c256a-bdf3-11f1-97aa-57de57b8fb69'};delete reserved.reciprocalCustomerReceiptDenial;
 assert.ok(navigationSnapshotSQL(reserved).includes("WHERE id='"+reserved.profileId+"' AND mobile='919888888874'"));
});

test('current genuine A invoice denial binds real B invoice, A phone and protected stored bytes/pricing',()=>{
 const a={...c,kind:'native-genuine-a-invoice-denial',customerBInvoiceDenial:false,genuineCustomerAInvoiceDenial:true,profileId:'79764e1a-3aed-4cac-9a25-42ccdafb79ac',profileName:'Customer A',targetInvoiceId:'11111111-1111-4111-8111-111111111111',targetInvoiceNumber:20261031,artifactSHA256:'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69',noAutomaticRetry:true,nativeAttempt:1};
 invoiceDenialConfig(a);assert.match(navigationSnapshotSQL(a),/mobile='919888888872'/);const target={id:a.targetInvoiceId,number:20261031,customer:'Backend Test Customer B',nativeAssigned:false};invoiceDenialTarget(a,target);
 const snapshot={profile:{id:a.profileId,name:a.profileName,role:'customer',active:true},nativeSessionPresent:true,otpCount:7,businessHash:'c'.repeat(64),otherAuthHash:'d'.repeat(64),storageHash:'e'.repeat(64),pricingHash:'f'.repeat(64)};invoiceDenialPreserved(a,{snapshot,target},{snapshot,target});
 for(const patch of [{customerBInvoiceDenial:true},{profileId:c.profileId},{profileName:'New customer'},{artifactSHA256:c.artifactSHA256},{nativeAttempt:4},{noAutomaticRetry:false},{targetInvoiceNumber:20261010}])assert.throws(()=>invoiceDenialConfig({...a,...patch}));
 assert.throws(()=>invoiceDenialTarget(a,{...target,nativeAssigned:true}));assert.throws(()=>invoiceDenialPreserved(a,{snapshot,target},{snapshot:{...snapshot,storageHash:'0'.repeat(64)},target}));assert.throws(()=>invoiceDenialPreserved(a,{snapshot,target},{snapshot:{...snapshot,pricingHash:'0'.repeat(64)},target}));
});
