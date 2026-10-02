import assert from 'node:assert/strict';

// Transport adapter must hold the actor lock and validate owned TLS, immutable
// bindings, actual document rows/bytes and a bounded deadline before calling.
export async function runPrivateDocumentDenial(c,d,state){
 assert.equal(c.scope,'isolated-fictional-a-private-document-denial');
 assert.equal(c.phone,'919888888872');
 assert.equal(c.profileId,'79764e1a-3aed-4cac-9a25-42ccdafb79ac');
 assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
 assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
 assert.match(c.documentPath,/^grn\/a24c256a-bdf3-11f1-97aa-57de57b8fb69\/[a-f0-9-]{36}\.pdf$/);
 assert.equal(state.otpAttempted,false);
 const gate=async()=>{assert.ok(Date.now()<Date.parse(c.deadlineUTC));await d.verifyOwnership();};
 const preserved=(b,a)=>{for(const key of ['nativeBSessionPresent','businessHash','storageHash','otherAuthHash','profileHash','assignmentsHash','enrollmentHash'])assert.deepEqual(a[key],b[key],key+' changed');};
 let access,refresh;
 await gate();const before=await d.snapshot();
 assert.deepEqual(before.profile,{id:c.profileId,role:'customer',active:true,status:'approved'});
 assert.ok(before.quota.hourly<5&&before.quota.daily<20);
 assert.equal(before.nativeBSessionPresent,true,'Existing native B session required');
 await d.verifyDocument(c.documentPath);
 try{
  state.otpAttempted=true;await d.record({phase:'ONE_ORDINARY_A_API_OTP_ATTEMPT'});
  assert.equal((await d.call('/functions/v1/operator-otp/request',{phone_number:c.phone})).body.success,true);
  let otp=await d.challenge(c.phone),login;
  try{assert.match(otp,/^\d{6}$/);login=await d.call('/functions/v1/operator-otp/verify',{phone_number:c.phone,otp_code:otp});}finally{otp=undefined;}
  assert.equal(login.status,200);assert.equal(login.body.success,true);
  assert.equal(login.body.data.user.id,c.profileId);assert.equal(login.body.data.user.role,'customer');
  access=login.body.data.session.access_token;refresh=login.body.data.session.refresh_token;login=undefined;
  assert.ok(typeof access==='string'&&access.length>0&&typeof refresh==='string'&&refresh.length>0);
  const authenticated=await d.snapshot();preserved(before,authenticated);
  assert.equal(authenticated.verifiedOTPs,before.verifiedOTPs+1);
  assert.equal(authenticated.quota.hourly,before.quota.hourly+1);assert.equal(authenticated.quota.daily,before.quota.daily+1);
  assert.deepEqual(authenticated.sessions.filter(s=>before.sessions.some(o=>o.id===s.id)),before.sessions);
  const added=authenticated.sessions.filter(s=>!before.sessions.some(o=>o.id===s.id));assert.equal(added.length,1);
  for(const test of [
   {route:'/storage/v1/object/documents/'+c.documentPath,body:undefined,allowed:[400,401,403,404],phase:'DIRECT_PRIVATE_B_DOCUMENT_DENIAL'},
   {route:'/functions/v1/generate-grn-pdf',body:{gr_no:'FXC702'},allowed:[404],phase:'CROSS_CUSTOMER_B_GRN_GENERATION_DENIAL'},
  ]){
   await gate();assert.deepEqual(await d.snapshot(),authenticated);await d.record({phase:test.phase,requestAttempted:true});
   const response=await d.call(test.route,test.body,access);assert.ok(test.allowed.includes(response.status),'Required denial missing');
   assert.equal(response.pdfBytesPresent,false,'Private document bytes exposed');
   assert.deepEqual(await d.snapshot(),authenticated);await d.verifyDocument(c.documentPath);
   await d.record({phase:test.phase,status:'PASS',httpStatus:response.status});
  }
  await gate();assert.deepEqual(await d.snapshot(),authenticated);
  assert.equal((await d.call('/rest/v1/rpc/logout_session',{p_refresh_token:refresh})).body,true);
  const final=await d.snapshot();preserved(authenticated,final);
  assert.deepEqual(final,{...authenticated,sessions:authenticated.sessions.filter(s=>s.id!==added[0].id)});
  await d.record({phase:'ONLY_NEW_A_API_SESSION_LOGGED_OUT',status:'PASS'});
  return {status:'PASS',scope:'A-to-B existing private B GRN direct-read/generation denial only',before,authenticated,final};
 }catch(error){await d.record({phase:'STOPPED_NO_REPLAY_OR_CLEANUP',exceptionType:error.name});throw error;}
 finally{access=refresh=undefined;}
}
