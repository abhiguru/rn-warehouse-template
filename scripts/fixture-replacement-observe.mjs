// Independent SQL preservation for two real same-origin fictional installations.
import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{readFileSync,writeFileSync,lstatSync,realpathSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';import{spawnSync}from'node:child_process';import{privateJSON,assertReleased}from'./fixture-session-guards.mjs';
process.umask(0o077);
try{
 const[path,phase]=process.argv.slice(2),c=privateJSON(path);assert.equal(c.scope,'isolated-fictional-replacement-case');assert.ok(['guard','before','after','failure'].includes(phase));assertReleased(c);assert.notEqual(c.primary.instanceId,c.replacement.instanceId);assert.equal(c.origin,'https://backend-core.example.test');const snapshots={};
 for(const role of ['primary','replacement']){
  const f=c[role],guard=resolve(f.checkout,'tests/operator-fixture.mjs');assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),f.guardSHA256);const manifest=privateJSON(resolve(f.state,'public/instance.json'));assert.equal(manifest.instanceId,f.instanceId);assert.equal(manifest.canonicalOrigin,c.origin);process.env.WAREHOUSE_STATE_DIR=f.state;const{operatorFixture}=await import(pathToFileURL(guard).href),{env}=operatorFixture();
  if(phase==='guard')continue;
  const tables=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','grn_images'];const business=tables.map(t=>`'${t}',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.${t} x)`).join(',');const phone=role==='primary'?'919888888871':'919888888891',other=role==='primary'?'919888888891':'919888888871';
  const sql=`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';SELECT jsonb_build_object(
 'businessHash',encode(extensions.digest(jsonb_build_object(${business},'storage',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM storage.objects x))::text,'sha256'),'hex'),
 'authHash',encode(extensions.digest(jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x),'otp',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x),'quota',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x),'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x))::text,'sha256'),'hex'),
 'administrator',(SELECT jsonb_build_object('id',id,'name',name,'active',active,'role',role) FROM public.user_profiles WHERE mobile='${phone}'),
 'otherAdministratorPresent',EXISTS(SELECT 1 FROM public.user_profiles WHERE mobile='${other}'),
 'originalNativeSessionPresent',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions WHERE id='${c.originalNativeSessionId}' AND expires_at>now()),
 'otpCount',(SELECT count(*) FROM public.otp_verifications));COMMIT;`;
  assert.match(c.originalNativeSessionId,/^[a-f0-9-]{36}$/);const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});assert.equal(q.status,0,'PRIVATE_REPLACEMENT_SQL_FAILED');const v=JSON.parse(q.stdout);assert.equal(v.administrator.role,'admin');assert.equal(v.administrator.active,true);assert.equal(v.administrator.name,role==='primary'?'Core Demo Administrator':'Replacement Demo Administrator');assert.equal(v.otherAdministratorPresent,false);assert.equal(v.originalNativeSessionPresent,role==='primary');snapshots[role]=v;
 }
 if(phase!=='guard'){
  const e=resolve(c.caseDirectory),s=lstatSync(e);assert.ok(s.isDirectory()&&s.uid===process.getuid()&&(s.mode&0o077)===0&&realpathSync(e)===e);
  if(phase!=='before')assert.deepEqual(snapshots,privateJSON(resolve(e,'replacement-before.json')).snapshots,'REPLACEMENT_CHANGED_PRESERVED_WAREHOUSE_STATE');
  writeFileSync(resolve(e,'replacement-'+phase+'.json'),JSON.stringify({status:'PASS',phase,snapshots}),{flag:'wx',mode:0o600});
 }
 console.log(JSON.stringify({status:'PASS',phase,scope:'two independent fictional identities and preserved SQL state'}));
}catch{console.error(JSON.stringify({status:'FAIL',category:'REPLACEMENT_OBSERVATION_REFUSED'}));process.exitCode=1;}
