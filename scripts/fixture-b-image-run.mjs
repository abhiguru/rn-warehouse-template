import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bFixturePNG} from './fixture-b-image-bytes.mjs';
import {bImageConfig,bImageBefore,bImageAuthenticated,bImageRegistered,bImageUploaded,bImageConfirmed,bImageLoggedOut} from './fixture-b-image-controls.mjs';
// Adapter must own the actor lock, enforce exact source/normal transport bindings,
// and preserve a consistent private backup before execution. Credentials stay in memory.
export async function runBImage(c,deps,state){
 bImageConfig(c);assert.equal(state.otpAttempted,false);assert.deepEqual(state.writes,[]);
 assert.equal(c.preservationVerified,true);assert.ok(Date.parse(c.deadlineUTC)>Date.now()&&Date.parse(c.deadlineUTC)-Date.now()<=3600000);let access,refresh,uploadToken;
 const gate=async()=>{assert.ok(Date.now()<Date.parse(c.deadlineUTC));await deps.verifyOwnership();};
 const claim=async phase=>{await gate();state.writes.push({phase,status:'ATTEMPTED_NO_REPLAY'});await deps.record({phase});};
 try{
  await gate();const before=await deps.snapshot();bImageBefore(c,before);
  const bytes=await deps.image();assert.deepEqual(bytes,bFixturePNG());assert.equal(bytes.length,c.fileSize);assert.equal(createHash('sha256').update(bytes).digest('hex'),c.imageSHA256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  state.otpAttempted=true;await deps.record({phase:'ONE_ORDINARY_ADMINISTRATOR_OTP_ATTEMPT'});
  assert.equal((await deps.call('/functions/v1/operator-otp/request',{phone_number:c.adminPhone})).success,true);
  let otp=await deps.challenge(c.adminPhone),login;assert.match(otp,/^\d{6}$/);
  try{login=await deps.call('/functions/v1/operator-otp/verify',{phone_number:c.adminPhone,otp_code:otp});}finally{otp=undefined;}
  assert.equal(login.success,true);assert.deepEqual({id:login.data.user.id,role:login.data.user.role,active:login.data.user.active},{id:c.adminProfileId,role:'admin',active:true});
  access=login.data.session.access_token;refresh=login.data.session.refresh_token;login=undefined;for(const t of [access,refresh])assert.ok(typeof t==='string'&&t.length>0&&t.length<16384);
  const authenticated=await deps.snapshot(),sessionId=bImageAuthenticated(c,before,authenticated);await deps.record({phase:'ORDINARY_ADMINISTRATOR_LOGIN_RECONCILED',sessionId});
  await gate();assert.deepEqual(await deps.snapshot(),authenticated);await claim('ONE_IMAGE_REGISTRATION_ATTEMPT');
  let registration=await deps.call('/rest/v1/rpc/register_grn_image_upload',{p_grn_id:c.grnId,p_image_type:'header',p_file_name:c.fileName,p_file_size:c.fileSize,p_mime_type:c.mimeType},access);assert.equal(registration.success,true);assert.equal(registration.grn_id,c.grnId);
  const registered=await deps.snapshot();bImageRegistered(c,authenticated,registered,registration);uploadToken=registration.upload_token;const imageId=registration.image_id,path=registration.storage_path;registration=undefined;
  await deps.record({phase:'PENDING_IMAGE_RECONCILED',imageId,path});assert.deepEqual(await deps.snapshot(),registered);await claim('ONE_NEW_OBJECT_UPLOAD_ATTEMPT');
  await deps.upload(path,bytes,access);const uploaded=await deps.snapshot();bImageUploaded(c,registered,uploaded);assert.equal(await deps.readObjectSHA256(path,access),c.imageSHA256);await deps.record({phase:'NEW_OBJECT_SQL_AND_BYTES_RECONCILED'});
  assert.deepEqual(await deps.snapshot(),uploaded);await claim('ONE_IMAGE_CONFIRMATION_ATTEMPT');assert.equal((await deps.call('/rest/v1/rpc/confirm_grn_image_upload',{p_image_id:imageId,p_upload_token:uploadToken},access)).success,true);uploadToken=undefined;
  const confirmed=await deps.snapshot();bImageConfirmed(c,uploaded,confirmed);assert.equal(await deps.readObjectSHA256(path,access),c.imageSHA256);await deps.record({phase:'CONFIRMED_IMAGE_SQL_AND_BYTES_RECONCILED'});
  await gate();assert.deepEqual(await deps.snapshot(),confirmed);assert.equal(await deps.call('/rest/v1/rpc/logout_session',{p_refresh_token:refresh}),true);const final=await deps.snapshot();bImageLoggedOut(c,confirmed,final,sessionId);
  await deps.record({phase:'ONLY_NEW_ADMINISTRATOR_SESSION_LOGGED_OUT'});return {status:'PASS',scope:'API fixture preparation only; native image/isolation acceptance separate',before,authenticated,registered,uploaded,confirmed,final,imageSHA256:c.imageSHA256};
 }catch(error){await deps.record({phase:'STOPPED_NO_REPLAY_OR_CLEANUP',exceptionType:error.name,otpAttempted:state.otpAttempted,writes:state.writes});throw error;}
 finally{access=refresh=uploadToken=undefined;}
}
