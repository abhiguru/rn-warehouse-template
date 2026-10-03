import assert from 'node:assert/strict';
export function bInvoicePDFConfig(c,now=Date.now()) {
 assert.equal(c.scope,'isolated-fictional-b-invoice-pdf-preparation');
 assert.equal(c.origin,'https://backend-core.example.test');
 assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
 assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
 assert.equal(c.phone,'919888888874');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');
 assert.equal(c.invoiceId,'61ea9776-bee9-11f1-8f09-eb03297e3235');
 assert.equal(c.invoiceNumber,20261031);assert.equal(c.financialYear,2026);
 assert.equal(c.noAutomaticRetry,true);assert.equal(c.attempt,1);
 assert.ok(Date.parse(c.deadlineUTC)>now&&Date.parse(c.deadlineUTC)-now<=600000);
 return c;
}
export function samePDFProtected(before,after) {
 for(const k of ['profile','profileStaticHash','otherAuthHash','businessHash','enrollmentHash','invoice'])assert.deepEqual(after[k],before[k],k+' changed');
}
export function verifyAddedPDF(before,after,name,bytesSHA256,size) {
 samePDFProtected(before,after);
 for(const k of ['sessions','verifiedOTPs','quota'])assert.deepEqual(after[k],before[k],k+' changed during document generation');
 assert.match(name,/^invoice\/61ea9776-bee9-11f1-8f09-eb03297e3235\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.pdf$/);
 const added=after.objects.filter(v=>!before.objects.some(o=>o.id===v.id));assert.equal(added.length,1);assert.equal(added[0].bucket,'documents');assert.equal(added[0].name,name);
 assert.deepEqual(after.objects.filter(v=>before.objects.some(o=>o.id===v.id)),before.objects);
 for(const [key,value] of Object.entries(before.files))assert.deepEqual(after.files[key],value,'Old stored file changed');
 const files=Object.entries(after.files).filter(([key])=>!Object.hasOwn(before.files,key));assert.equal(files.length,1);
 assert.ok(files[0][0].includes('/documents/'+name+'/'),'Stored path does not match actual object');
 assert.deepEqual(files[0][1],{size,sha256:bytesSHA256});
 return {name,objectId:added[0].id,storedFile:files[0][0],size,sha256:bytesSHA256};
}
export async function prepareBInvoicePDF(c,d,state) {
 bInvoicePDFConfig(c);const gate=async()=>{bInvoicePDFConfig(c);await d.verifyOwnership();};
 await gate();const before=await d.snapshot();await d.evidence('before',before);
 assert.deepEqual(before.profile,{id:c.profileId,role:'supervisor',active:true,status:'approved'});
 assert.ok(before.quota.hourly<5&&before.quota.daily<20);
 assert.equal(before.invoice.id,c.invoiceId);assert.equal(before.invoice.number,20261031);
 assert.equal(before.invoice.customerId,'a8246002-bdb6-11f1-b1bf-07b1deb5bca2');assert.equal(before.invoice.total,8);assert.equal(before.invoice.tax,1);
 assert.ok(!before.objects.some(o=>o.bucket==='documents'&&o.name.startsWith('invoice/'+c.invoiceId+'/')),'Existing target PDF: no duplicate generation');
 let credentials;
 try {
  state.attempts.authentication++;await d.record({phase:'ONE_ORDINARY_SUPERVISOR_AUTHENTICATION'});credentials=await d.authenticate();
  const authenticated=await d.snapshot();await d.evidence('authenticated',authenticated);samePDFProtected(before,authenticated);assert.deepEqual(authenticated.objects,before.objects);assert.deepEqual(authenticated.files,before.files);
  assert.equal(authenticated.verifiedOTPs,before.verifiedOTPs+1);assert.equal(authenticated.quota.hourly,before.quota.hourly+1);assert.equal(authenticated.quota.daily,before.quota.daily+1);
  assert.deepEqual(authenticated.sessions.filter(v=>before.sessions.some(o=>o.id===v.id)),before.sessions);
  const added=authenticated.sessions.filter(v=>!before.sessions.some(o=>o.id===v.id));assert.equal(added.length,1);assert.equal(added[0].id,credentials.sessionId);
  await gate();assert.deepEqual(await d.snapshot(),authenticated);
  state.attempts.generation++;await d.record({phase:'ONE_B_INVOICE_PDF_GENERATION'});
  const generated=await d.generateAndRead(credentials.access);
  const committed=await d.snapshot();await d.evidence('committed',committed);
  const document=verifyAddedPDF(authenticated,committed,generated.name,generated.sha256,generated.size);await d.evidence('generated',{...document,downloadSHA256:generated.sha256});
  await gate();assert.deepEqual(await d.snapshot(),committed);
  await d.logout(credentials.refresh);
  const final=await d.snapshot();await d.evidence('after',final);assert.deepEqual(final,{...committed,sessions:committed.sessions.filter(v=>v.id!==added[0].id)});
  await d.record({phase:'ONLY_NEW_SUPERVISOR_API_SESSION_REMOVED',status:'PASS'});
  return {status:'PASS',scope:'Actual fictional B invoice PDF generation/download and preservation only; no A denial or native PDF claim',artifactSHA256:c.artifactSHA256,generated:document};
 } catch(error) {try{await d.evidence('failed-observation',await d.snapshot());}catch{await d.record({phase:'FAILED_READ_ONLY_RECONCILIATION'});}await d.record({phase:'STOP_NO_REPLAY_OR_UNRECONCILED_CLEANUP',exceptionType:error.name});throw error;}
 finally {credentials=undefined;}
}
