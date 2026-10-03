// Ordinary mock delivery/verification only. No SQL-issued login or recorded credentials.
import assert from 'node:assert/strict';
import { realtimeConfig,realtimeBefore } from './fixture-realtime-controls.mjs';

export async function authenticateRealtimeCaller(c,{call,challenge,snapshot,record},state) {
  realtimeConfig(c);assert.equal(state.otpAttempted,false);
  const before=await snapshot();realtimeBefore(c,before);
  assert.ok(before.callerQuota.hourly<5&&before.callerQuota.daily<20,'ORDINARY_CALLER_QUOTA_EXHAUSTED');
  state.otpAttempted=true;
  await record({phase:'ONE_ORDINARY_CALLER_OTP_REQUEST_ATTEMPT'});
  const sent=await call('/functions/v1/operator-otp/request',{phone_number:c.callerPhone});
  assert.equal(sent.success,true);
  let otp=await challenge(c.callerPhone);assert.match(otp,/^\d{6}$/);
  let login;
  try {login=await call('/functions/v1/operator-otp/verify',{phone_number:c.callerPhone,otp_code:otp});}
  finally {otp=undefined;}
  assert.equal(login.success,true);assert.equal(login.data.user.id,c.callerProfileId);
  assert.equal(login.data.user.name,'Customer A');assert.equal(login.data.user.role,'customer');
  assert.equal(login.data.user.active,true);
  const access=login.data.session.access_token,refresh=login.data.session.refresh_token;
  assert.ok(typeof access==='string'&&access.length>0&&typeof refresh==='string'&&refresh.length>0);
  login=undefined;
  const after=await snapshot();realtimeBefore(c,after);
  for(const key of ['nativeProfile','nativeSessionPresent','callerProfile','stock','cart','items','businessHash','cartStaticHash','authExceptCallerHash','callerStaticProfileHash'])
    assert.deepEqual(after[key],before[key],'CALLER_AUTH_CHANGED_PRESERVED_STATE');
  assert.equal(after.callerVerifiedOTPs,before.callerVerifiedOTPs+1);
  assert.equal(after.callerQuota.daily,before.callerQuota.daily+1);
  assert.equal(after.callerQuota.hourly,before.callerQuota.hourly+1);
  for(const previous of before.callerSessions)
    assert.deepEqual(after.callerSessions.find(s=>s.id===previous.id),previous,'EXISTING_CALLER_SESSION_CHANGED');
  const added=after.callerSessions.filter(s=>!before.callerSessions.some(p=>p.id===s.id));
  assert.equal(added.length,1,'ONE_ORDINARY_API_SESSION_REQUIRED');
  await record({phase:'ORDINARY_CALLER_AUTHENTICATED',sessionId:added[0].id});
  // Return privately to the in-process orchestrator, never to a ledger or stdout.
  return {access,refresh,sessionId:added[0].id,before,baseline:after};
}
