import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalExpirySnapshotSQL} from './fixture-natural-expiry-snapshot.mjs';
const c={scope:'isolated-fictional-dedicated-natural-expiry',sessionId:'00000000-0000-4000-8000-000000000001',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',phone:'919888888874'};
test('expiry SQL refuses non-owned accounts and malformed session identifiers before execution',()=>{
 assert.match(naturalExpirySnapshotSQL(c),/REPEATABLE READ READ ONLY/);
 for(const edit of [{scope:'production'},{phone:'919888888871'},{profileId:'00000000-0000-4000-8000-000000000001'},{sessionId:"x';DELETE"}])assert.throws(()=>naturalExpirySnapshotSQL({...c,...edit}));
});
