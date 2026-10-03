import assert from 'node:assert/strict';
import {bRejectionConfig,bRejectionBefore,bRejectionAfterLogin,bRejectionAfterCommit,bRejectionAfterLogout} from './fixture-b-rejection-controls.mjs';
// The caller supplies hash-bound owned transport/SQL and holds the native actor lock.
export async function runBRejection(c,deps,state){
 bRejectionConfig(c);assert.equal(state.otpAttempted,false);assert.equal(state.rejectionAttempted,false);
 const deadline=Date.parse(c.deadlineUTC);assert.ok(deadline>Date.now()&&deadline-Date.now()<=3600000);
 let access,refresh;
 const gate=async()=>{assert.ok(Date.now()<deadline);await deps.verifyOwnership();};
 try{
  await gate();const before=await deps.snapshot();bRejectionBefore(c,before);
  state.otpAttempted=true;await deps.record({phase:'ONE_ORDINARY_ADMINISTRATOR_OTP_ATTEMPT'});
  assert.equal((await deps.call('/functions/v1/operator-otp/request',{phone_number:c.adminPhone})).success,true);
  let otp=await deps.challenge(c.adminPhone),login;assert.match(otp,/^\d{6}$/);
  try{login=await deps.call('/functions/v1/operator-otp/verify',{phone_number:c.adminPhone,otp_code:otp});}finally{otp=undefined;}
  assert.equal(login.success,true);assert.equal(login.data.user.id,c.adminProfileId);assert.equal(login.data.user.role,'admin');assert.equal(login.data.user.active,true);
  access=login.data.session.access_token;refresh=login.data.session.refresh_token;login=undefined;
  for(const token of [access,refresh])assert.ok(typeof token==='string'&&token.length>0&&token.length<16384);
  const authenticated=await deps.snapshot(),id=bRejectionAfterLogin(c,before,authenticated);
  await deps.record({phase:'ORDINARY_ADMINISTRATOR_LOGIN_RECONCILED',sessionId:id});
  await gate();assert.deepEqual(await deps.snapshot(),authenticated,'State changed before rejection');
  state.rejectionAttempted=true;await deps.record({phase:'ONE_SUPPORTED_B_REJECTION_ATTEMPT'});
  const result=await deps.call('/rest/v1/rpc/operator_review_enrollment',{p_user_id:c.profileId,p_decision:'rejected',p_customer_ids:[]},access);
  assert.equal(result.success,true);assert.equal(result.data.status,'rejected');
  const rejected=await deps.snapshot();bRejectionAfterCommit(c,authenticated,rejected);await deps.record({phase:'B_REJECTION_INDEPENDENTLY_RECONCILED'});
  await gate();assert.equal(await deps.call('/rest/v1/rpc/logout_session',{p_refresh_token:refresh}),true);
  const final=await deps.snapshot();bRejectionAfterLogout(c,rejected,final,id);
  await deps.record({phase:'ONLY_NEW_ADMINISTRATOR_SESSION_LOGGED_OUT'});return {status:'PASS',scope:'ordinary B rejection only; native acceptance separate',before,authenticated,rejected,final};
 }catch(error){await deps.record({phase:'STOPPED_NO_REPLAY',otpAttempted:state.otpAttempted,rejectionAttempted:state.rejectionAttempted,exceptionType:error.name});throw error;}
 finally{access=refresh=undefined;}
}
