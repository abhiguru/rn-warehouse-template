import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalExpirySnapshotSQL,naturalExpiryAfter} from './fixture-natural-expiry-snapshot.mjs';
const c={scope:'isolated-fictional-dedicated-natural-expiry',sessionId:'00000000-0000-4000-8000-000000000001',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',phone:'919888888874'};
test('expiry SQL refuses non-owned accounts and malformed session identifiers before execution',()=>{
 assert.match(naturalExpirySnapshotSQL(c),/REPEATABLE READ READ ONLY/);
 for(const edit of [{scope:'production'},{phone:'919888888871'},{profileId:'00000000-0000-4000-8000-000000000001'},{sessionId:"x';DELETE"}])assert.throws(()=>naturalExpirySnapshotSQL({...c,...edit}));
});

test('expiry reconciliation rejects token rotation, new authentication and business changes',()=>{
 const before={serverNowUTC:'2026-10-10T10:10:00Z',profile:{id:c.profileId,active:true,status:'approved'},session:{id:c.sessionId,expiresAtUTC:'2026-10-10T10:00:00Z',expired:true},targetSessionHash:'a'.repeat(64),otherSessionsHash:'b'.repeat(64),authenticationHash:'c'.repeat(64),businessHash:'d'.repeat(64)};
 const native={loginRequired:true,protectedTabsVisible:false,OTPRequested:false,artifactMatches:true,ownedDedicatedAVD:true,selectedServerMatches:true};
 assert.equal(naturalExpiryAfter(c,before,{...before,serverNowUTC:'2026-10-10T10:11:00Z'},native).status,'PASS');
 for(const key of ['targetSessionHash','otherSessionsHash','authenticationHash','businessHash'])assert.throws(()=>naturalExpiryAfter(c,before,{...before,[key]:'f'.repeat(64)},native));
 for(const edit of [{session:null},{session:{...before.session,expired:false}},{serverNowUTC:'2026-10-10T10:09:00Z'}])assert.throws(()=>naturalExpiryAfter(c,before,{...before,...edit},native));
 for(const edit of [{loginRequired:false},{protectedTabsVisible:true},{OTPRequested:true},{artifactMatches:false},{ownedDedicatedAVD:false},{selectedServerMatches:false}])assert.throws(()=>naturalExpiryAfter(c,before,before,{...native,...edit}));
 assert.throws(()=>naturalExpiryAfter(c,{...before,session:{...before.session,expired:false}},before,native));
 assert.match(naturalExpirySnapshotSQL(c),/'targetSessionHash'/);
});
