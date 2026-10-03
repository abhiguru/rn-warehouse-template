import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {privateJSON} from './fixture-session-guards.mjs';
import {revocationConfig} from './fixture-revocation-controls.mjs';
const groups=['receipts','orders','dispatch','invoices','documents','realtime','switching','isolation'];
export function revocationClosure(c,closure) {
 revocationConfig(c);assert.equal(closure.scope,'fictional-native-workflow-closure-before-revocation');
 assert.equal(closure.profileId,c.profileId);assert.equal(closure.artifactSHA256,c.artifactSHA256);
 assert.deepEqual(closure.groups.map(x=>x.id).sort(),[...groups].sort(),'Every dependent workflow must be reviewed');
 for(const group of closure.groups){
  assert.ok(['PASS','BLOCKED'].includes(group.status),'Pending workflows prohibit revocation');
  assert.ok(group.evidence.length>0);
  if(group.status==='BLOCKED'){assert.equal(group.attempts,3);assert.equal(group.noFurtherNativeAttempts,true);assert.ok(group.reconciliation);}
  for(const proof of [...group.evidence,...(group.reconciliation?[group.reconciliation]:[])]){
   assert.equal(typeof proof.path,'string');assert.match(proof.sha256,/^[a-f0-9]{64}$/);
  }
 }
 return closure;
}
export function revocationGroupProof(c,group,value,reconciliation=false) {
 revocationConfig(c);
 assert.equal(value.artifactSHA256,c.artifactSHA256,'Dependency artifact must match the installed candidate');
 assert.equal(value.profileId,c.profileId,'Dependency profile must match the reserved account');
 assert.equal(value.workflowGroup,group.id,'A narrow or different workflow cannot close this group');
 assert.equal(value.scope,reconciliation ? 'fictional-native-workflow-group-reconciliation' : 'fictional-native-workflow-group-proof','Explicit complete-group evidence required');
 if(reconciliation) assert.equal(value.status,'PASS','Unreconciled writes prohibit revocation');
 else {
  assert.equal(value.status,group.status,'Group result must match its independently recorded proof');
  if(group.status==='BLOCKED') {
   assert.equal(value.attempts,3);
   assert.equal(value.noFurtherNativeAttempts,true);
  }
 }
 return value;
}
export function verifyRevocationDependencies(c) {
 const closure=revocationClosure(c,privateJSON(c.dependencyClosureFile));
 for(const group of closure.groups){
  for(const proof of group.evidence){
   const value=privateJSON(proof.path);assert.equal(createHash('sha256').update(readFileSync(proof.path)).digest('hex'),proof.sha256,'Dependency evidence changed');
   revocationGroupProof(c,group,value);
  }
  if(group.reconciliation){const proof=group.reconciliation;const value=privateJSON(proof.path);assert.equal(createHash('sha256').update(readFileSync(proof.path)).digest('hex'),proof.sha256);revocationGroupProof(c,group,value,true);}
 }
 return {status:'PASS',scope:'all-dependent-workflows-reviewed-before-revocation'};
}
