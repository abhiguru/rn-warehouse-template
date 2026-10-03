import test from 'node:test';import assert from 'node:assert/strict';
import {runPrivateDocumentDenial} from './fixture-private-document-run.mjs';
function fixture(fault){
 const c={scope:'isolated-fictional-b-private-document-denial',phone:'919888888873',profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',documentPath:'invoice/b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c/11111111-1111-4111-8111-111111111111.pdf',deadlineUTC:new Date(Date.now()+60000).toISOString()};
 let s={profile:{id:c.profileId,role:'customer',active:true,status:'approved'},sessions:[{id:'native',rowHash:'old'}],quota:{hourly:0,daily:0},verifiedOTPs:1,businessHash:'business',storageHash:'storage',otherAuthHash:'other',profileHash:'profile',assignmentsHash:'assignments',enrollmentHash:'enrollment'};const calls=[],events=[];
 const d={verifyOwnership:async()=>{},verifyDocument:async()=>{},snapshot:async()=>globalThis.structuredClone(s),record:async e=>events.push(e),challenge:async()=> '123456',call:async(route)=>{
  calls.push(route);
  if(route.endsWith('/request'))return {status:200,body:{success:true}};
  if(route.endsWith('/verify')){s={...s,sessions:[...s.sessions,{id:'new',rowHash:'new'}],quota:{hourly:1,daily:1},verifiedOTPs:2};return {status:200,body:{success:true,data:{user:{id:c.profileId,role:'customer'},session:{access_token:'mock-access',refresh_token:'mock-refresh'}}}};}
  if(route.endsWith('/logout_session')){s.sessions=s.sessions.filter(x=>x.id!=='new');return {status:200,body:true};}
  if(fault==='timeout')throw new Error('transport uncertain');
  if(fault==='write')s.storageHash='unexpected-document';
  return {status:fault==='exposure'?200:404,pdfBytesPresent:fault==='exposure'};
 }};return {c,d,calls,events,state:{otpAttempted:false},current:()=>s};
}
test('private document denial preserves existing native session and cleans only its ordinary API session',async()=>{const f=fixture();assert.equal((await runPrivateDocumentDenial(f.c,f.d,f.state)).status,'PASS');assert.deepEqual(f.current().sessions,[{id:'native',rowHash:'old'}]);assert.equal(f.calls.filter(x=>x.endsWith('/logout_session')).length,1);});
test('exposure, uncertain transport or unexpected document mutation stop without replay or logout',async()=>{for(const fault of ['exposure','timeout','write']){const f=fixture(fault);await assert.rejects(runPrivateDocumentDenial(f.c,f.d,f.state));assert.equal(f.calls.filter(x=>x.startsWith('/storage/')).length,1);assert.ok(!f.calls.some(x=>x.endsWith('/logout_session')));assert.equal(f.current().sessions.length,2);assert.equal(f.events.at(-1).phase,'STOPPED_NO_REPLAY_OR_CLEANUP');}});
test('wrong document, expired deadline and exhausted ordinary quota refuse before OTP',async()=>{for(const change of ['path','deadline','quota']){const f=fixture();if(change==='path')f.c.documentPath='other.pdf';if(change==='deadline')f.c.deadlineUTC=new Date(0).toISOString();if(change==='quota')f.current().quota.hourly=5;await assert.rejects(runPrivateDocumentDenial(f.c,f.d,f.state));assert.deepEqual(f.calls,[]);assert.equal(f.state.otpAttempted,false);}});
