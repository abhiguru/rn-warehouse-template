import assert from 'node:assert/strict';
import {revocationBefore,revocationAfterLogin} from './fixture-revocation-controls.mjs';

// Caller holds the owned native actor lock. Credentials never reach record().
export async function authenticateRevocationAdministrator(c,{snapshot,call,challenge,record},state) {
 assert.equal(state.otpAttempted,false,'Never repeat uncertain authentication');
 const before=await snapshot();revocationBefore(c,before);
 state.otpAttempted=true;await record({phase:'ONE_ORDINARY_ADMINISTRATOR_OTP_ATTEMPT'});
 const sent=await call('/functions/v1/operator-otp/request',{phone_number:c.adminPhone});assert.equal(sent.success,true);
 let otp=await challenge(c.adminPhone),login;assert.match(otp,/^\d{6}$/);
 try{login=await call('/functions/v1/operator-otp/verify',{phone_number:c.adminPhone,otp_code:otp});}finally{otp=undefined;}
 assert.equal(login.success,true);assert.equal(login.data.user.id,c.adminProfileId);assert.equal(login.data.user.name,'Core Demo Administrator');assert.equal(login.data.user.role,'admin');assert.equal(login.data.user.active,true);
 const access=login.data.session.access_token,refresh=login.data.session.refresh_token;
 assert.ok(typeof access==='string'&&access.length>0&&access.length<16384);assert.ok(typeof refresh==='string'&&refresh.length>0&&refresh.length<16384);login=undefined;
 const baseline=await snapshot(),sessionId=revocationAfterLogin(c,before,baseline);
 await record({phase:'ORDINARY_ADMINISTRATOR_AUTHENTICATED',sessionId});
 return {access,refresh,sessionId,before,baseline};
}
