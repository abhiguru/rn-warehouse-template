// Independent SQL and stored-byte reconciliation for one native fictional PDF.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { privateJSON, assertReleased } from './fixture-session-guards.mjs';
import { navigationConfig, navigationSnapshotSQL, navigationBefore, navigationAfter } from './fixture-navigation-guards.mjs';
process.umask(0o077);
try {
  const [path,phase]=process.argv.slice(2),c=navigationConfig(privateJSON(path));
  assert.equal(c.kind,'native-pdf-send');assert.equal(c.case,'same-server');
  assert.ok(['guard','before','after-generation','after'].includes(phase));
  assert.match(c.invoiceId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.equal(c.invoiceNumber,20261001);assert.equal(c.invoiceTotal,147);assert.equal(c.invoiceTax,7);
  assertReleased(c);
  if(phase!=='guard') {
    const e=resolve(c.caseDirectory),st=lstatSync(e);assert.ok(st.isDirectory()&&st.uid===process.getuid()&&(st.mode&0o077)===0&&realpathSync(e)===e);
    const guard=resolve(c.backendCheckout,'tests/operator-fixture.mjs');assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),c.fixtureGuardSHA256);
    process.env.WAREHOUSE_STATE_DIR=c.backendState;const {operatorFixture}=await import(pathToFileURL(guard).href),{env}=operatorFixture();
    assert.equal(JSON.parse(readFileSync(resolve(c.backendState,'public/instance.json'))).instanceId,c.instanceId);
    const prefix=`invoice/${c.invoiceId}/`;
    const original='FROM storage.objects o)';let sql=navigationSnapshotSQL(c);assert.equal(sql.split(original).length,2);
    sql=sql.replace(original,`FROM storage.objects o WHERE NOT (bucket_id='documents' AND name LIKE '${prefix}%'))`);
    sql=sql.replace('COMMIT;',`SELECT jsonb_build_object('invoice',(SELECT jsonb_build_object('id',id,'number',inv_no,'year',inv_fin_year,'total',total,'tax',tax_amount) FROM public.invoice WHERE id='${c.invoiceId}' AND deleted_at IS NULL),
     'documents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'size',(o.metadata->>'size')::bigint,'mime',o.metadata->>'mimetype','rowHash',encode(extensions.digest(to_jsonb(o)::text,'sha256'),'hex')) ORDER BY o.id),'[]') FROM storage.objects o WHERE bucket_id='documents' AND name LIKE '${prefix}%'));COMMIT;`);
    const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});assert.equal(q.status,0,'PRIVATE_READONLY_PDF_OBSERVATION_FAILED');
    const rows=q.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(rows.length,2);const snapshot=rows[0],details=rows[1];
    assert.deepEqual(details.invoice,{id:c.invoiceId,number:c.invoiceNumber,year:2026,total:147,tax:7});navigationBefore(c,snapshot);
    const root=resolve(c.backendState,'data/storage'),files={};let bytes=0;
    function walk(dir){for(const name of readdirSync(dir)){const file=resolve(dir,name),s=lstatSync(file);assert.ok(!s.isSymbolicLink());if(s.isDirectory())walk(file);else{assert.ok(s.isFile()&&s.size<=10485760&&Object.keys(files).length<1000&&(bytes+=s.size)<=268435456);files[file.slice(root.length+1)]={size:s.size,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')};}}}walk(root);
    let generated=null;
    if(phase!=='before') {
      const b=privateJSON(resolve(e,'pdf-before.json'));navigationAfter(c,b.snapshot,snapshot);assert.deepEqual(details.invoice,b.details.invoice);
      assert.equal(details.documents.length,b.details.documents.length+1);
      for(const old of b.details.documents)assert.deepEqual(details.documents.find(x=>x.id===old.id),old,'OLD_DOCUMENT_CHANGED');
      const added=details.documents.filter(x=>!b.details.documents.some(o=>o.id===x.id));assert.equal(added.length,1);const doc=added[0];
      assert.match(doc.name,new RegExp('^'+prefix+'[a-f0-9-]{36}\\.pdf$'));assert.equal(doc.mime,'application/pdf');assert.ok(doc.size>1000&&doc.size<=1048576);
      for(const [name,file]of Object.entries(b.files))assert.deepEqual(files[name],file,'OLD_STORED_BYTES_CHANGED');
      const fresh=Object.keys(files).filter(name=>!Object.hasOwn(b.files,name));assert.equal(fresh.length,1);const name=fresh[0];
      assert.ok(name.startsWith('stub/stub/documents/'+doc.name+'/'));assert.equal(files[name].size,doc.size);assert.equal(readFileSync(resolve(root,name)).subarray(0,5).toString(),'%PDF-');
      generated={id:doc.id,name:doc.name,storedFile:name,size:doc.size,sha256:files[name].sha256};
      if(phase==='after')assert.deepEqual(generated,privateJSON(resolve(e,'pdf-after-generation.json')).generated,'NATIVE_DOCUMENT_CHANGED');
    }
    writeFileSync(resolve(e,'pdf-'+phase+'.json'),JSON.stringify({status:'PASS',phase,artifactSHA256:c.artifactSHA256,snapshot,details,files,generated}),{flag:'wx',mode:0o600});
  }
  console.log(JSON.stringify({status:'PASS',phase,scope:'readonly-native-pdf-observation'}));
} catch {console.error(JSON.stringify({status:'FAIL',category:'NATIVE_PDF_OBSERVATION_REFUSED'}));process.exitCode=1;}
