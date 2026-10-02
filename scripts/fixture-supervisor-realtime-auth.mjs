import assert from 'node:assert/strict';import{supervisorConfig}from'./fixture-supervisor-realtime-controls.mjs';
const accounts={A:{phone:'919888888872',id:'79764e1a-3aed-4cac-9a25-42ccdafb79ac',role:'customer'},supervisor:{phone:'919888888874',id:'947136fa-997b-4a83-819d-1b8bd3ecba68',role:'supervisor'},admin:{phone:'919888888871',id:'f94caa4f-0051-4660-920a-5f41aac86fa7',role:'admin'}};
function unchanged(b,a,role){
 for(const key of ['nativeSupervisorSessionPresent','businessHash','storageHash','unrelatedAuthHash','carts'])assert.deepEqual(a[key],b[key],key+' changed');
 for(const r of Object.keys(accounts))if(r!==role)assert.deepEqual(a.participants[r],b.participants[r],'Other participant changed');
 assert.deepEqual(a.participants[role].profile,b.participants[role].profile);assert.equal(a.participants[role].staticHash,b.participants[role].staticHash);
}
export async function authenticateSupervisorAccount(c,role,d,state){
 supervisorConfig(c);assert.ok(Object.hasOwn(accounts,role));assert.ok(Date.now()<Date.parse(c.deadlineUTC));
 assert.ok(Array.isArray(state.authAttempts));assert.ok(state.apiSessionIds&&typeof state.apiSessionIds==='object');assert.ok(!state.authAttempts.includes(role),'Ordinary authentication attempt consumed');
 await d.verifyOwnership();const before=await d.snapshot(),p=before.participants[role],account=accounts[role];
 assert.equal(before.nativeSupervisorSessionPresent,true);assert.equal(p.profile.id,account.id);assert.equal(p.profile.role,account.role);assert.equal(p.profile.active,true);
 assert.ok(p.quota.hourly<5&&p.quota.daily<20,'Ordinary quota exhausted');
 await d.evidence('auth-before-'+role,before);state.authAttempts.push(role);await d.record({phase:'ONE_ORDINARY_'+role+'_OTP_ATTEMPT'});
 let access,refresh;
 try{
  assert.equal((await d.call('/functions/v1/operator-otp/request',{phone_number:account.phone})).body.success,true);
  let otp=await d.challenge(account.phone),login;
  try{assert.match(otp,/^\d{6}$/);login=await d.call('/functions/v1/operator-otp/verify',{phone_number:account.phone,otp_code:otp});}finally{otp=undefined;}
  assert.equal(login.status,200);assert.equal(login.body.success,true);assert.equal(login.body.data.user.id,account.id);assert.equal(login.body.data.user.role,account.role);assert.equal(login.body.data.user.active,true);
  access=login.body.data.session.access_token;refresh=login.body.data.session.refresh_token;login=undefined;
  for(const token of [access,refresh])assert.ok(typeof token==='string'&&token.length>0&&token.length<16384);
  const after=await d.snapshot();unchanged(before,after,role);const a=after.participants[role];
  assert.equal(a.verifiedOTPs,p.verifiedOTPs+1);assert.equal(a.quota.hourly,p.quota.hourly+1);assert.equal(a.quota.daily,p.quota.daily+1);
  assert.deepEqual(a.sessions.filter(s=>p.sessions.some(old=>old.id===s.id)),p.sessions);const added=a.sessions.filter(s=>!p.sessions.some(old=>old.id===s.id));assert.equal(added.length,1);
  assert.match(added[0].id,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.match(added[0].rowSHA256,/^[a-f0-9]{64}$/);assert.ok(Number.isFinite(Date.parse(added[0].issuedAt))&&Date.parse(added[0].expiresAt)>Date.parse(added[0].issuedAt)&&Date.parse(added[0].expiresAt)>Date.now());
  state.apiSessionIds[role]=added[0].id;await d.evidence('auth-after-'+role,after);await d.record({phase:'ORDINARY_'+role+'_SESSION_RECONCILED',sessionId:added[0].id});
  // Never serialize this returned object. Only the in-process adapter receives it.
  return {access,refresh,sessionId:added[0].id};
 }catch(error){await d.record({phase:'AUTH_STOPPED_NO_REPLAY_OR_CLEANUP',role,exceptionType:error.name});throw error;}
 finally{access=refresh=undefined;}
}
export async function logoutSupervisorAccount(c,role,credentials,d,state){
 supervisorConfig(c);assert.ok(Object.hasOwn(accounts,role));assert.equal(state.acceptanceReconciled,true,'No cleanup before all required case gates reconcile');
 assert.equal(credentials.sessionId,state.apiSessionIds[role],'Only the reconciled new API session may be removed');assert.ok(Array.isArray(state.logoutAttempts)&&!state.logoutAttempts.includes(role),'Logout attempt consumed');assert.ok(Date.now()<Date.parse(c.deadlineUTC));await d.verifyOwnership();const before=await d.snapshot();
 assert.ok(before.participants[role].sessions.some(s=>s.id===credentials.sessionId));
 state.logoutAttempts.push(role);await d.record({phase:'ONLY_NEW_'+role+'_API_LOGOUT_ATTEMPT',sessionId:credentials.sessionId});
 assert.equal((await d.call('/rest/v1/rpc/logout_session',{p_refresh_token:credentials.refresh})).body,true);
 const after=await d.snapshot();unchanged(before,after,role);assert.deepEqual(after.participants[role],{...before.participants[role],sessions:before.participants[role].sessions.filter(s=>s.id!==credentials.sessionId)});
 await d.evidence('logout-after-'+role,after);await d.record({phase:'ONLY_NEW_'+role+'_API_SESSION_REMOVED',status:'PASS'});return after;
}
