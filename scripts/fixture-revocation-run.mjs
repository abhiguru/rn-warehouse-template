import assert from 'node:assert/strict';
import {authenticateRevocationAdministrator} from './fixture-revocation-auth.mjs';
import {revocationAfterDisable,revocationAfterAdminLogout} from './fixture-revocation-controls.mjs';

// Transport/native implementations are provided by the frozen guarded actor.
export async function runRevocation(c,deps,state) {
 assert.equal(state.disableAttempted,false,'Do not replay an uncertain disable');
 const deadline=Date.parse(c.deadlineUTC);assert.ok(deadline>Date.now()&&deadline-Date.now()<=3600000,'One-hour bounded revocation stage required');
 let auth;
 try {
  await deps.verifyDependencies(); // Do not consume quota for pending workflows.
  auth=await authenticateRevocationAdministrator(c,deps,state);
  await deps.call('/rest/v1/rpc/check_session',{},auth.access);
  assert.deepEqual(await deps.snapshot(),auth.baseline,'State changed before disable');
  assert.ok(Date.now()<deadline,'No mutation after deadline');
  await deps.verifyDependencies();
  state.disableAttempted=true;await deps.record({phase:'ONE_SUPPORTED_DISABLE_ATTEMPT'});
  const result=await deps.call('/rest/v1/rpc/operator_review_enrollment',{p_user_id:c.profileId,p_decision:'disabled',p_customer_ids:[]},auth.access);
  assert.equal(result.success,true);assert.equal(result.data.status,'disabled');
  const disabled=await deps.snapshot();revocationAfterDisable(c,auth.baseline,disabled);
  await deps.record({phase:'DISABLE_INDEPENDENTLY_RECONCILED'});
  assert.equal(await deps.call('/rest/v1/rpc/logout_session',{p_refresh_token:auth.refresh}),true);
  const final=await deps.snapshot();revocationAfterAdminLogout(c,disabled,final,auth.sessionId);
  auth.access=auth.refresh=undefined;
  await deps.record({phase:'NEW_ADMINISTRATOR_SESSION_LOGGED_OUT_OLD_SESSIONS_PRESERVED'});
  await deps.nativeColdLogin();
  assert.deepEqual(await deps.snapshot(),final,'Native restoration changed preserved state');
  await deps.record({phase:'NATIVE_COLD_LOGIN_REQUIRED_AND_FINAL_PRESERVATION_PASS'});
  return {status:'PASS',before:auth.before,afterAuthentication:auth.baseline,afterDisable:disabled,final,administratorSessionId:auth.sessionId};
 } catch(error) {
  await deps.record({phase:'STOPPED_NO_REPLAY',disableAttempted:state.disableAttempted,exceptionType:error.name});throw error;
 } finally {if(auth)auth.access=auth.refresh=undefined;}
}
