import {roleSnapshotSQL,roleSnapshot} from './fixture-role-snapshot.mjs';
import {spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import test from 'node:test';import assert from 'node:assert/strict';import {rolePreparation,roleBefore,roleAfter,roleAuthenticated,roleCommitted} from './fixture-role-controls.mjs';
const record=id=>({id,issuedAt:'2026-10-01T00:00:00Z',expiresAt:'2026-10-08T00:00:00Z',rowSHA256:'a'.repeat(64)});
const c={scope:'isolated-fictional-role-preparation',phone:'919888888874',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',action:'prepare-staff'};const b={target:{id:c.profileId,name:c.profileName,role:'customer',active:true,status:'approved'},targetSessions:[],adminHourly:0,adminDaily:2,admin:{role:'admin',active:true},targetOtherFieldsHash:'a'.repeat(64),targetAssignmentsHash:'b'.repeat(64),otherAuthHash:'c'.repeat(64),businessHash:'d'.repeat(64),adminSessions:[record('11111111-1111-1111-1111-111111111111')],targetOTPs:1,adminOTPs:3};
test('only reserved logged-out approved profile and ordinary available quota can change role',()=>{roleBefore(c,b);for(const change of [{phone:'919888888873'},{profileId:'11111111-1111-1111-1111-111111111111'},{action:'promote-admin'}])assert.throws(()=>rolePreparation({...c,...change}));assert.throws(()=>roleBefore(c,{...b,targetSessions:['active']}));assert.throws(()=>roleBefore(c,{...b,adminHourly:5}));assert.throws(()=>roleBefore(c,{...b,businessHash:undefined}));assert.throws(()=>roleBefore(c,{...b,adminDaily:-1}));});
test('role change preserves assignments, all other profile fields and unrelated warehouse/authentication state',()=>{const a={...b,target:{...b.target,role:'staff'},adminOTPs:4};roleAfter(c,b,a);for(const change of [{targetAssignmentsHash:'changed'},{targetOtherFieldsHash:'changed'},{businessHash:'changed'},{adminSessions:[]},{adminOTPs:5}])assert.throws(()=>roleAfter(c,b,{...a,...change}));roleAfter({...c,action:'restore-customer'},{...b,target:{...b.target,role:'staff'}},{...a,target:{...b.target,role:'customer'}});});

test('queue fixture explicitly uses supervisor and preserves reversible legacy staff cleanup',()=>{
 assert.deepEqual(rolePreparation({...c,action:'prepare-supervisor'}),{before:'customer',after:'supervisor'});
 roleAfter({...c,action:'prepare-supervisor'},b,{...b,target:{...b.target,role:'supervisor'},adminOTPs:4});
 roleAfter({...c,action:'restore-supervisor-customer'},{...b,target:{...b.target,role:'supervisor'}},{...b,adminOTPs:4});
 assert.throws(()=>roleBefore({...c,action:'restore-supervisor-customer'},{...b,target:{...b.target,role:'staff'}}));
});

test('ordinary login and committed role must reconcile before temporary-session cleanup',()=>{
 const old=record('11111111-1111-1111-1111-111111111111'),fresh=record('22222222-2222-2222-2222-222222222222');
 const before={...b,adminSessions:[old]},authenticated={...before,adminOTPs:4,adminSessions:[old,fresh]},committed={...authenticated,target:{...b.target,role:'staff'}};
 assert.equal(roleAuthenticated(c,before,authenticated),fresh.id);assert.equal(roleCommitted(c,before,authenticated,committed),fresh.id);
 for(const patch of [{adminSessions:[fresh]},{adminSessions:[old]},{adminSessions:[old,fresh,fresh]},{adminSessions:[old,{id:'bad'}]},{targetOTPs:2},{businessHash:'e'.repeat(64)}])assert.throws(()=>roleAuthenticated(c,before,{...authenticated,...patch}));
 for(const patch of [{target:b.target},{adminSessions:[old]},{otherAuthHash:'e'.repeat(64)},{targetAssignmentsHash:'e'.repeat(64)}])assert.throws(()=>roleCommitted(c,before,authenticated,{...committed,...patch}));
});

test('role stage refuses malformed configuration before authentication or attempt creation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fixture-role-refusal-'));try{const f=join(dir,'config.json');writeFileSync(f,JSON.stringify({scope:'wrong',secret:'PRIVATE_SENTINEL'}),{mode:0o600});
 const q=spawnSync(process.execPath,['scripts/fixture-role-prepare.mjs',f,'guard'],{encoding:'utf8',timeout:5000});assert.equal(q.status,1);assert.match(q.stderr,/SOURCE_GUARD/);assert.ok(!q.stderr.includes('PRIVATE_SENTINEL'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('existing administrator session credentials and timestamps cannot change under the same ID',()=>{
 const old=record('11111111-1111-1111-1111-111111111111'),fresh=record('22222222-2222-2222-2222-222222222222'),before={...b,adminSessions:[old]},authenticated={...before,adminOTPs:4,adminSessions:[old,fresh]};
 for(const patch of [{rowSHA256:'b'.repeat(64)},{expiresAt:'2026-10-09T00:00:00Z'},{issuedAt:'2026-10-02T00:00:00Z'}])assert.throws(()=>roleAuthenticated(c,before,{...authenticated,adminSessions:[{...old,...patch},fresh]}));
 for(const patch of [{rowSHA256:undefined},{issuedAt:'invalid'},{expiresAt:old.issuedAt}])assert.throws(()=>roleBefore(c,{...before,adminSessions:[{...old,...patch}]}));
});

test('role observer is bounded read-only SQL with fixed identity and no credential output',()=>{
 const sql=roleSnapshotSQL(c);assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/statement_timeout='10s'/);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|TRUNCATE)\b/i);assert.throws(()=>roleSnapshotSQL({...c,profileId:"x';DELETE"}));
 const observed=roleSnapshot(c,{WAREHOUSE_PROJECT_NAME:'owned',POSTGRES_PASSWORD:'PRIVATE_SENTINEL'},(program,args,options)=>{assert.equal(program,'docker');assert.equal(options.timeout,15000);assert.equal(options.maxBuffer,1048576);assert.ok(!JSON.stringify(args).includes('PRIVATE_SENTINEL'));assert.ok(!options.input.includes('PRIVATE_SENTINEL'));return {status:0,stdout:JSON.stringify(b)};});assert.deepEqual(observed,b);
 assert.throws(()=>roleSnapshot(c,{WAREHOUSE_PROJECT_NAME:'owned'},()=>({status:1,stdout:'PRIVATE_SENTINEL'})),/Owned read-only role snapshot failed/);
});

test('current staff-control preparation is reversible and requires exact APK10 scope',()=>{
 const config={...c,action:'prepare-supervisor-staff',currentStaffControls:true,noAutomaticRetry:true,artifactSHA256:'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69'};
 const before={...b,target:{...b.target,role:'supervisor'}};
 const after={...before,target:{...before.target,role:'staff'},adminOTPs:before.adminOTPs+1};
 roleAfter(config,before,after);assert.deepEqual(rolePreparation({...config,action:'restore-staff-supervisor'}),{before:'staff',after:'supervisor'});
 roleAfter({...config,action:'restore-staff-supervisor'},after,{...after,target:before.target,adminOTPs:after.adminOTPs+1});
 for(const patch of [{currentStaffControls:false},{artifactSHA256:'f'.repeat(64)},{noAutomaticRetry:false},{phone:'919888888873'}])assert.throws(()=>rolePreparation({...config,...patch}));
 assert.throws(()=>roleBefore(config,{...before,targetSessions:[record('22222222-2222-2222-2222-222222222222')]}));
});

import { CURRENT_FIXTURE_SHA256, CURRENT_FIXTURE_BINDING } from './fixture-current-candidate.mjs';
test('current installed staff preparation retains logged-out state, quota and exact candidate guards',()=>{
 const next={...c,action:'prepare-supervisor-staff',currentStaffControls:true,noAutomaticRetry:true,artifactSHA256:CURRENT_FIXTURE_SHA256,candidateBinding:{...CURRENT_FIXTURE_BINDING},origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971'};
 const before={...b,target:{...b.target,role:'supervisor'}};
 roleBefore(next,before);roleAfter(next,before,{...before,target:{...before.target,role:'staff'},adminOTPs:before.adminOTPs+1});
 for(const patch of [{candidateBinding:undefined},{candidateBinding:{...CURRENT_FIXTURE_BINDING,package:'production'}},{noAutomaticRetry:false}])assert.throws(()=>rolePreparation({...next,...patch}));
 assert.throws(()=>roleBefore(next,{...before,targetSessions:[record('22222222-2222-2222-2222-222222222222')]}));
});
