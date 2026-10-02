import test from 'node:test';import assert from 'node:assert/strict';
import {runPrivateDocumentDenial} from './fixture-private-image-run.mjs';
function fixture(fault){
 const c={scope:'isolated-fictional-a-private-image-denial',phone:'919888888872',profileId:'79764e1a-3aed-4cac-9a25-42ccdafb79ac',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',imagePath:'headers/a24c256a-bdf3-11f1-97aa-57de57b8fb69/11111111-1111-4111-8111-111111111111_fixture-b-0109.png',deadlineUTC:new Date(Date.now()+60000).toISOString()};
 let s={nativeBSessionPresent:true,profile:{id:c.profileId,role:'customer',active:true,status:'approved'},sessions:[{id:'native',rowHash:'old'}],quota:{hourly:0,daily:0},verifiedOTPs:1,businessHash:'business',storageHash:'storage',otherAuthHash:'other',profileHash:'profile',assignmentsHash:'assignments',enrollmentHash:'enrollment'};const calls=[],events=[];
 const d={verifyOwnership:async()=>{},verifyImage:async()=>{},snapshot:async()=>structuredClone(s),record:async e=>events.push(e),challenge:async()=> '123456',call:async(route,body)=>{
  calls.push(route);
  if(route.endsWith('/request'))return {status:200,body:{success:true}};
  if(route.endsWith('/verify')){s={...s,sessions:[...s.sessions,{id:'new',rowHash:'new'}],quota:{hourly:1,daily:1},verifiedOTPs:2};return {status:200,body:{success:true,data:{user:{id:c.profileId,role:'customer'},session:{access_token:'mock-access',refresh_token:'mock-refresh'}}}};}
  if(route.endsWith('/logout_session')){s.sessions=s.sessions.filter(x=>x.id!=='new');return {status:200,body:true};}
  if(fault==='timeout')throw new Error('transport uncertain');
  if(fault==='write')s.storageHash='unexpected-document';
  return {status:fault==='exposure'?200:404,sensitiveBytesPresent:fault==='exposure'};
 }};return {c,d,calls,events,state:{otpAttempted:false},current:()=>s};
}
test('private image denial preserves existing native session and cleans only its ordinary API session',async()=>{const f=fixture();assert.equal((await runPrivateDocumentDenial(f.c,f.d,f.state)).status,'PASS');assert.deepEqual(f.current().sessions,[{id:'native',rowHash:'old'}]);assert.equal(f.calls.filter(x=>x.endsWith('/logout_session')).length,1);});
test('exposure, uncertain transport or unexpected stored-object mutation stop without replay or logout',async()=>{for(const fault of ['exposure','timeout','write']){const f=fixture(fault);await assert.rejects(runPrivateDocumentDenial(f.c,f.d,f.state));assert.equal(f.calls.filter(x=>x.startsWith('/storage/')).length,1);assert.ok(!f.calls.some(x=>x.endsWith('/logout_session')));assert.equal(f.current().sessions.length,2);assert.equal(f.events.at(-1).phase,'STOPPED_NO_REPLAY_OR_CLEANUP');}});
test('wrong image, expired deadline and exhausted ordinary quota refuse before OTP',async()=>{for(const change of ['path','deadline','quota']){const f=fixture();if(change==='path')f.c.imagePath='other.png';if(change==='deadline')f.c.deadlineUTC=new Date(0).toISOString();if(change==='quota')f.current().quota.hourly=5;await assert.rejects(runPrivateDocumentDenial(f.c,f.d,f.state));assert.deepEqual(f.calls,[]);assert.equal(f.state.otpAttempted,false);}});
