import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {bFixturePNG} from './fixture-b-image-bytes.mjs';
import {bImageConfig,bImageBefore,bImageRegistered,bImageUploaded,bImageConfirmed,bImageLoggedOut} from './fixture-b-image-controls.mjs';
import {runBImage} from './fixture-b-image-run.mjs';import {bImageSnapshotSQL,bImageSnapshot} from './fixture-b-image-snapshot.mjs';
const c={scope:'isolated-fictional-b-image-preparation',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',phone:'919888888873',customerId:'a8246002-bdb6-11f1-b1bf-07b1deb5bca2',adminProfileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',adminPhone:'919888888871',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',grnId:'a24c256a-bdf3-11f1-97aa-57de57b8fb69',record:'FXC702',fileName:'fixture-b-0109.png',mimeType:'image/png',fileSize:160,imageSHA256:'d4575f91c6f9ed6eac9dc6da8fca4d5a016fe481c4e82887bbba35f98f83029d',preservationVerified:true};
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',newSession='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',objectId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const registration={success:true,grn_id:c.grnId,image_id:id,upload_token:newSession,storage_path:'headers/'+c.grnId+'/'+objectId+'_fixture-b-0109.png'};
function samples(){
 const before={target:{id:c.profileId,name:'Customer B',role:'customer',active:false,status:'disabled'},targetSessions:[],assignments:[{user_profile_id:c.profileId,customer_id:c.customerId,active:false}],admin:{id:c.adminProfileId,role:'admin',active:true},adminSessions:[{id,rowSHA256:'a'.repeat(64)}],adminHourly:0,adminDaily:0,adminOTPCount:20,targetOTPCount:3,businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64),targetStaticHash:'c'.repeat(64),adminStaticHash:'d'.repeat(64),receipt:{id:c.grnId,record:c.record,customerId:c.customerId},images:[],objects:[{id,bucket:'documents',name:'old.pdf',rowSHA256:'e'.repeat(64)}]};
 const auth={...before,adminSessions:[...before.adminSessions,{id:newSession,rowSHA256:'b'.repeat(64)}],adminHourly:1,adminDaily:1,adminOTPCount:21};
 const pending={...auth,images:[{id,grnId:c.grnId,imageType:'header',grnItemId:null,displayOrder:0,path:registration.storage_path,fileName:c.fileName,fileSize:c.fileSize,mimeType:c.mimeType,uploadedBy:c.adminProfileId,status:'pending',tokenPresent:true,staticSHA256:'f'.repeat(64)}]};
 const uploaded={...pending,objects:[...pending.objects,{id:objectId,bucket:'grn-images',name:registration.storage_path,rowSHA256:'c'.repeat(64)}]};
 const confirmed={...uploaded,images:[{...uploaded.images[0],status:'confirmed',tokenPresent:false}]};
 const final={...confirmed,adminSessions:before.adminSessions};return {before,auth,pending,uploaded,confirmed,final};
}
test('B image preparation binds genuine receipt and fixed PNG; rejects quotas, old images and object replacement',()=>{
 const x=samples();bImageBefore(c,x.before);assert.equal(createHash('sha256').update(bFixturePNG()).digest('hex'),c.imageSHA256);
 for(const edit of [{grnId:id},{customerId:id},{fileSize:1024},{imageSHA256:'f'.repeat(64)},{scope:'native-upload'}])assert.throws(()=>bImageConfig({...c,...edit}));
 assert.throws(()=>bImageBefore(c,{...x.before,adminDaily:20}));assert.throws(()=>bImageBefore(c,{...x.before,images:x.pending.images}));
 bImageRegistered(c,x.auth,x.pending,registration);bImageUploaded(c,x.pending,x.uploaded);bImageConfirmed(c,x.uploaded,x.confirmed);bImageLoggedOut(c,x.confirmed,x.final,newSession);
 assert.throws(()=>bImageUploaded(c,x.pending,{...x.uploaded,objects:x.uploaded.objects.slice(1)}));assert.throws(()=>bImageConfirmed(c,x.uploaded,{...x.confirmed,images:[{...x.confirmed.images[0],staticSHA256:'a'.repeat(64)}]}));
 assert.throws(()=>bImageLoggedOut(c,x.confirmed,{...x.final,adminSessions:[]},newSession));
});
function depsFor(loss){
 const x=samples(),queue=[x.before,x.auth,x.auth,x.pending,x.pending,x.uploaded,x.uploaded,x.confirmed,x.confirmed,x.final],calls=[],events=[];
 const deps={verifyOwnership:async()=>{},snapshot:async()=>queue.shift(),image:async()=>bFixturePNG(),challenge:async()=> '123456',record:async e=>events.push(e),readObjectSHA256:async()=>c.imageSHA256,upload:async()=>{calls.push('upload');if(loss==='upload')throw Error('Uncertain upload');},call:async path=>{
  calls.push(path);if(path.endsWith('/request'))return {success:true};if(path.endsWith('/verify'))return {success:true,data:{user:{id:c.adminProfileId,role:'admin',active:true},session:{access_token:'private-access',refresh_token:'private-refresh'}}};
  if(path.endsWith('/register_grn_image_upload')){if(loss==='register')throw Error('Uncertain registration');return registration;}
  if(path.endsWith('/confirm_grn_image_upload')){if(loss==='confirm')throw Error('Uncertain confirmation');return {success:true};}
  if(path.endsWith('/logout_session'))return true;throw Error('Route refused');
 }};return {deps,calls,events};
}
test('ordinary B image API fixture reconciles each phase and logs out only its new administrator session',async()=>{
 const {deps,calls,events}=depsFor(),state={otpAttempted:false,writes:[]};const out=await runBImage({...c,deadlineUTC:new Date(Date.now()+60000).toISOString()},deps,state);
 assert.equal(out.status,'PASS');assert.equal(state.writes.length,3);assert.equal(calls.filter(x=>x==='upload').length,1);assert.equal(calls.at(-1),'/rest/v1/rpc/logout_session');assert.doesNotMatch(JSON.stringify(events),/123456|private-access|private-refresh|upload_token/);
});
test('uncertain image registration, upload or confirmation consumes the write and forbids cleanup or replay',async()=>{
 for(const loss of ['register','upload','confirm']){
  const {deps,calls}=depsFor(loss),state={otpAttempted:false,writes:[]},cfg={...c,deadlineUTC:new Date(Date.now()+60000).toISOString()};
  await assert.rejects(runBImage(cfg,deps,state));assert.equal(calls.some(x=>x.endsWith('/logout_session')),false);const count=calls.length;await assert.rejects(runBImage(cfg,deps,state));assert.equal(calls.length,count);
 }
});
test('B image SQL is one bounded read-only snapshot and never exports an upload token',()=>{
 const sql=bImageSnapshotSQL(c);assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/statement_timeout='10s'/);assert.match(sql,/upload_token IS NOT NULL/);assert.doesNotMatch(sql,/jsonb_build_object\('upload_token'/);assert.match(sql,/other_grn_images/);assert.match(sql,/grn_id<>'a24c256a/);
 let options;const result=bImageSnapshot(c,{WAREHOUSE_PROJECT_NAME:'owned',POSTGRES_PASSWORD:'private'},(_cmd,_args,o)=>{options=o;return {status:0,stdout:'{}'};});assert.deepEqual(result,{});assert.equal(options.timeout,15000);assert.equal(options.maxBuffer,1048576);
});

test('image preparation refuses absent preservation, expired deadlines, real quota exhaustion and changed input before OTP',async()=>{
 for(const kind of ['preservation','deadline','quota','bytes']){
  const {deps,calls}=depsFor(),state={otpAttempted:false,writes:[]},cfg={...c,deadlineUTC:new Date(Date.now()+60000).toISOString()};
  if(kind==='preservation')cfg.preservationVerified=false;if(kind==='deadline')cfg.deadlineUTC=new Date(Date.now()-1).toISOString();
  if(kind==='quota')deps.snapshot=async()=>({...samples().before,adminDaily:20});if(kind==='bytes')deps.image=async()=>Buffer.alloc(160);
  await assert.rejects(runBImage(cfg,deps,state));assert.equal(calls.length,0);assert.equal(state.otpAttempted,false);assert.deepEqual(state.writes,[]);
 }
});
