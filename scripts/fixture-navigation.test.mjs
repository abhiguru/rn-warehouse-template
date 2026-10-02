import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { navigationConfig, navigationSnapshotSQL, navigationBefore, navigationAfter } from './fixture-navigation-guards.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const c = () => ({ scope:'isolated-fictional-navigation-case', case:'same-server',
  backendCheckout:'/owned/backend', backendState:'/owned/core-backend-test-1', soakConfig:'/private/ui.json',
  artifactAudit:'/private/audit.json', caseDirectory:'/private/new', instanceId:id(1), profileId:id(2), sessionId:id(3),
  profileName:'Core Demo Administrator', artifactSHA256:'a'.repeat(64), fixtureGuardSHA256:'b'.repeat(64) });
const before = () => ({ profile:{id:id(2),name:'Core Demo Administrator',role:'admin',active:true},
  nativeSessionPresent:true,otpCount:2,businessHash:'c'.repeat(64),otherAuthHash:'d'.repeat(64) });
test('navigation cases reject non-fixture scope, identities and injection', () => {
  navigationConfig(c());
  for (const edit of [{scope:'production'}, {case:'login'}, {profileName:'Other'}, {instanceId:"x';DELETE"}, {backendState:'relative'}])
    assert.throws(()=>navigationConfig({...c(),...edit}));
  const sql=navigationSnapshotSQL(c());
  assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/statement_timeout='10s'/);
  assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|ALTER|TRUNCATE)\b/i);
});
test('cancel and same-server preserve state; confirmed switching revokes only the native session', () => {
  navigationBefore(c(),before());navigationAfter(c(),before(),before());
  navigationAfter({...c(),case:'confirm-switch'},before(),{...before(),nativeSessionPresent:false});
  assert.throws(()=>navigationAfter({...c(),case:'cancel-switch'},before(),{...before(),nativeSessionPresent:false}));
  assert.throws(()=>navigationAfter({...c(),case:'confirm-switch'},before(),before()));
  for(const key of ['businessHash','otherAuthHash','otpCount','profile'])
    assert.throws(()=>navigationAfter(c(),before(),{...before(),[key]:'changed'}));
});
test('native navigation controls reject dangerous actions and unowned route/radio restoration', () => {
  const r=spawnSync('python3',[fileURLToPath(new URL('./fixture-ui/test_navigation_controls.py',import.meta.url))],{encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
});

test('reciprocal switching binds the destination administrator and revokes only its native session', () => {
  const config={...c(),case:'switch-back',profileName:'Switch Demo Administrator'};
  const snapshot={...before(),profile:{...before().profile,name:'Switch Demo Administrator'}};
  navigationBefore(config,snapshot);
  assert.match(navigationSnapshotSQL(config),/mobile='919888888881'/);
  assert.doesNotMatch(navigationSnapshotSQL(config),/919888888871/);
  navigationAfter(config,snapshot,{...snapshot,nativeSessionPresent:false});
  assert.throws(()=>navigationAfter(config,snapshot,snapshot));
  assert.throws(()=>navigationConfig({...config,profileName:'Core Demo Administrator'}));
});

test('cold lifecycle requires a preserved active native session and unchanged business/authentication', () => {
  const config={...c(),case:'cold-lifecycle'};
  navigationConfig(config);navigationAfter(config,before(),before());
  assert.throws(()=>navigationBefore(config,{...before(),nativeSessionPresent:false}));
  assert.throws(()=>navigationAfter(config,before(),{...before(),nativeSessionPresent:false}));
  for(const key of ['businessHash','otherAuthHash','otpCount','profile'])
    assert.throws(()=>navigationAfter(config,before(),{...before(),[key]:'changed'}));
  assert.doesNotMatch(navigationSnapshotSQL(config),/\b(INSERT|UPDATE|DELETE|ALTER|TRUNCATE)\b/i);
});

test('ordinary logout revokes only its matched native session and preserves unrelated state', () => {
  const config={...c(),case:'ordinary-logout'};
  navigationAfter(config,before(),{...before(),nativeSessionPresent:false});
  assert.throws(()=>navigationAfter(config,before(),before()));
  assert.throws(()=>navigationAfter(config,before(),{...before(),nativeSessionPresent:false,otherAuthHash:'changed'}));
});

// Customer logout is a separate role-specific case, never an administrator rerun.
test('reserved customer logout binds its role and phone and revokes only its session', () => {
 const config={...c(),case:'customer-logout',profileName:'New customer'};
 const snapshot={...before(),profile:{...before().profile,name:'New customer',role:'customer'}};
 navigationBefore(config,snapshot);
 assert.match(navigationSnapshotSQL(config),/mobile='919888888874'/);
 navigationAfter(config,snapshot,{...snapshot,nativeSessionPresent:false});
 assert.throws(()=>navigationBefore(config,{...snapshot,profile:{...snapshot.profile,role:'admin'}}));
 assert.throws(()=>navigationConfig({...config,profileName:'Core Demo Administrator'}));
 assert.throws(()=>navigationAfter(config,snapshot,snapshot));
 assert.throws(()=>navigationAfter(config,snapshot,{...snapshot,nativeSessionPresent:false,businessHash:'changed'}));
});

test('temporary reserved staff cleanup binds exact profile and revokes only its session', () => {
 const profileId='947136fa-997b-4a83-819d-1b8bd3ecba68';
 const config={...c(),case:'staff-logout',profileId,profileName:'New customer'};
 const snapshot={...before(),profile:{id:profileId,name:'New customer',role:'staff',active:true}};
 navigationBefore(config,snapshot);navigationAfter(config,snapshot,{...snapshot,nativeSessionPresent:false});
 assert.match(navigationSnapshotSQL(config),/mobile='919888888874'/);
 for(const role of ['customer','admin','supervisor'])assert.throws(()=>navigationBefore(config,{...snapshot,profile:{...snapshot.profile,role}}));
 assert.throws(()=>navigationConfig({...config,profileId:id(2)}));
 assert.throws(()=>navigationAfter(config,snapshot,snapshot));
 assert.throws(()=>navigationAfter(config,snapshot,{...snapshot,nativeSessionPresent:false,otherAuthHash:'changed'}));
});
