import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {queueConfig} from './fixture-queue-processing-controls.mjs';
export function queueSQL(c){
 queueConfig(c);
 const business=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','stock_movements','grn_images','dispatch_images','idempotency_keys','auto_invoice_errors','customers','items'];
 const protectedPairs=[...business,'storage.objects'].map(t=>{const table=t.includes('.')?t:'public.'+t;return `'${t}',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'sha256',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')) ORDER BY x.id),'[]') FROM ${table} x)`;}).join(',');
 const pairs=business.map(t=>`'${t}',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.${t} x)`).join(',');
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';SELECT jsonb_build_object(
 'profile',(SELECT jsonb_build_object('id',id,'role',role,'active',active,'status',enrollment_status) FROM public.user_profiles WHERE mobile='919888888874'),
 'nativeSessionPresent',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.mobile='919888888874' AND s.id='${c.sessionId}' AND s.expires_at>now()),
 'order',(SELECT to_jsonb(o) FROM public.orders o WHERE id='${c.cartId}'),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]') FROM public.order_items i WHERE order_id='${c.cartId}'),
 'lots',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.goodsreceived_trl t WHERE gr_id='${c.sourceGRNId}'),
 'receipt',(SELECT to_jsonb(g) FROM public.goodsreceived g WHERE id='${c.sourceGRNId}'),
 'recordAbsent',NOT EXISTS(SELECT 1 FROM public.dispatch WHERE disp_no='${c.record}'),
 'dispatches',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM public.dispatch d WHERE disp_no='${c.record}'),
 'dispatchLines',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM public.dispatch_trl t JOIN public.dispatch d ON d.id=t.disp_id WHERE d.disp_no='${c.record}'),
 'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.stock_movements m JOIN public.dispatch d ON d.id=m.reference_id WHERE d.disp_no='${c.record}' AND m.reference_type='dispatch'),
 'caches',(SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.id),'[]') FROM public.idempotency_keys k WHERE k.response->>'dispatch_id' IN(SELECT id::text FROM public.dispatch WHERE disp_no='${c.record}')),
 'protectedRows',jsonb_build_object(${protectedPairs}),
 'businessHash',encode(extensions.digest(jsonb_build_object(${pairs},'storage',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM storage.objects x))::text,'sha256'),'hex'),
 'authHash',encode(extensions.digest(jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x),'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x),'otps',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x),'quotas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x),'enrollments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens x))::text,'sha256'),'hex'));COMMIT;`;
}
export function queueStorageHash(state){
 const root=resolve(state,'data/storage'),st=lstatSync(root);assert.ok(st.isDirectory()&&!st.isSymbolicLink());const files={};let bytes=0;
 function walk(dir){for(const name of readdirSync(dir).sort()){const p=resolve(dir,name),s=lstatSync(p);assert.ok(!s.isSymbolicLink(),'Stored object symlink refused');if(s.isDirectory())walk(p);else{assert.ok(s.isFile()&&s.size<=10485760&&Object.keys(files).length<1000&&(bytes+=s.size)<=268435456,'Stored object bound exceeded');files[p.slice(root.length+1)]={size:s.size,sha256:createHash('sha256').update(readFileSync(p)).digest('hex')};}}}walk(root);
 return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
export function queueSnapshot(c,env){
 const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:queueSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});
 assert.equal(q.status,0,'Owned read-only queue snapshot refused');const s=JSON.parse(q.stdout);s.storageHash=queueStorageHash(c.backendState);return s;
}
