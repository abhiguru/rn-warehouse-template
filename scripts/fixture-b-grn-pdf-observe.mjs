// Independent SQL and stored-byte reconciliation for one native fictional PDF.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { privateJSON, assertReleased } from './fixture-session-guards.mjs';
import { navigationAfter } from './fixture-navigation-guards.mjs';
import {bGRNPDFConfig,bGRNPDFHeader,bGRNPDFQuery,bGRNPDFBefore} from './fixture-b-grn-pdf-controls.mjs';
process.umask(0o077);
try {
  const [path,phase]=process.argv.slice(2),c=bGRNPDFConfig(privateJSON(path));
  assert.equal(c.kind,'native-customer-b-grn-pdf');assert.equal(c.case,'customer-b-grn-pdf');
  assert.ok(['guard','before','after-generation','after','after-reader'].includes(phase));
  assert.match(c.grnId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  const expectedHeader=bGRNPDFHeader(c);
  assertReleased(c);
  const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');assert.equal(digest(c.soakConfig),c.soakConfigSHA256);assert.equal(digest(c.helperConfig),c.helperConfigSHA256);
  const deadline=Date.parse(c.deadlineUTC);assert.ok(deadline>Date.now()&&deadline-Date.now()<=600000);assert.equal(privateJSON(c.campaignFile).deadline,c.campaignDeadlineUTC);assert.ok(deadline<=Date.parse(c.campaignDeadlineUTC));
  const ui=privateJSON(c.soakConfig),helper=privateJSON(c.helperConfig);assert.equal(helper.services.length,1);const h=helper.services[0];assert.equal(h.kind,'core');assert.equal(h.owningCheckout,c.backendCheckout);assert.equal(h.ownerGuardSHA256,c.fixtureGuardSHA256);assert.equal(h.state,c.backendState);assert.equal(h.ordersReadDelayMs??0,0);assert.equal(ui.managedUnits.core,'warehouse-fixture-core-'+helper.runId+'.service');assert.equal(ui.apkSHA256,c.artifactSHA256);
  const qUnit=spawnSync('systemctl',['--user','show',ui.managedUnits.core,'-p','ActiveState','-p','SubState','-p','Restart','-p','NRestarts','-p','RuntimeMaxUSec','-p','ExecStart'],{encoding:'utf8',timeout:5000});assert.equal(qUnit.status,0);const props=Object.fromEntries(qUnit.stdout.trim().split('\n').map(x=>{const n=x.indexOf('=');return[x.slice(0,n),x.slice(n+1)];}));assert.equal(props.ActiveState,'active');assert.equal(props.SubState,'running');assert.equal(props.Restart,'no');assert.equal(props.NRestarts,'0');assert.equal(props.RuntimeMaxUSec,'12h');assert.ok(props.ExecStart.includes(resolve(h.checkout,'scripts/emulator-fixture-bridge.mjs')));

  if(phase!=='guard') {
    const e=resolve(c.caseDirectory),st=lstatSync(e);assert.ok(st.isDirectory()&&st.uid===process.getuid()&&(st.mode&0o077)===0&&realpathSync(e)===e);
    const guard=resolve(c.backendCheckout,'tests/operator-fixture.mjs');assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),c.fixtureGuardSHA256);
    process.env.WAREHOUSE_STATE_DIR=c.backendState;const {operatorFixture}=await import(pathToFileURL(guard).href),{env}=operatorFixture();
    assert.equal(JSON.parse(readFileSync(resolve(c.backendState,'public/instance.json'))).instanceId,c.instanceId);
    const {prefix,sql}=bGRNPDFQuery(c);
    const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});assert.equal(q.status,0,'PRIVATE_READONLY_PDF_OBSERVATION_FAILED');
    const rows=q.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(rows.length,2);const snapshot=rows[0],details=rows[1];
    assert.deepEqual(details.header,expectedHeader);bGRNPDFBefore(c,snapshot,details);
    const root=resolve(c.backendState,'data/storage'),files={};let bytes=0;
    function walk(dir){for(const name of readdirSync(dir)){const file=resolve(dir,name),s=lstatSync(file);assert.ok(!s.isSymbolicLink());if(s.isDirectory())walk(file);else{assert.ok(s.isFile()&&s.size<=10485760&&Object.keys(files).length<1000&&(bytes+=s.size)<=268435456);files[file.slice(root.length+1)]={size:s.size,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')};}}}walk(root);
    let generated=null;
    if(phase!=='before') {
      const b=privateJSON(resolve(e,'pdf-before.json'));navigationAfter(c,b.snapshot,snapshot);assert.deepEqual(details.header,b.details.header);
      assert.equal(details.documents.length,b.details.documents.length+1);
      for(const old of b.details.documents)assert.deepEqual(details.documents.find(x=>x.id===old.id),old,'OLD_DOCUMENT_CHANGED');
      const added=details.documents.filter(x=>!b.details.documents.some(o=>o.id===x.id));assert.equal(added.length,1);const doc=added[0];
      assert.match(doc.name,new RegExp('^'+prefix+'[a-f0-9-]{36}\\.pdf$'));assert.equal(doc.mime,'application/pdf');assert.ok(doc.size>1000&&doc.size<=1048576);
      for(const [name,file]of Object.entries(b.files))assert.deepEqual(files[name],file,'OLD_STORED_BYTES_CHANGED');
      const fresh=Object.keys(files).filter(name=>!Object.hasOwn(b.files,name));assert.equal(fresh.length,1);const name=fresh[0];
      assert.ok(name.startsWith('stub/stub/documents/'+doc.name+'/'));assert.equal(files[name].size,doc.size);assert.equal(readFileSync(resolve(root,name)).subarray(0,5).toString(),'%PDF-');
      generated={id:doc.id,name:doc.name,storedFile:name,size:doc.size,sha256:files[name].sha256};
      if(['after','after-reader'].includes(phase))assert.deepEqual(generated,privateJSON(resolve(e,'pdf-after-generation.json')).generated,'NATIVE_DOCUMENT_CHANGED');
    }
    writeFileSync(resolve(e,'pdf-'+phase+'.json'),JSON.stringify({status:'PASS',phase,artifactSHA256:c.artifactSHA256,snapshot,details,files,generated}),{flag:'wx',mode:0o600});
  }
  console.log(JSON.stringify({status:'PASS',phase,scope:'readonly-native-pdf-observation'}));
} catch {console.error(JSON.stringify({status:'FAIL',category:'B_GRN_PDF_OBSERVATION_REFUSED'}));process.exitCode=1;}
