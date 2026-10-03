import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {bImageConfig} from './fixture-b-image-controls.mjs';
import {bApprovalSnapshotSQL} from './fixture-b-approval-snapshot.mjs';
export function bImageSnapshotSQL(c){
 bImageConfig(c);let sql=bApprovalSnapshotSQL({...c,scope:'isolated-fictional-b-approval'});
 sql=sql.replace("'grn_images',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.grn_images x)","'other_grn_images',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.grn_images x WHERE grn_id<>'"+c.grnId+"')");
 sql=sql.replace(",'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o)",'');
 return sql.replace(" 'target',",` 'receipt',(SELECT jsonb_build_object('id',id,'record',gr_no,'customerId',customer_id) FROM public.goodsreceived WHERE id='${c.grnId}'),
 'images',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'grnId',i.grn_id,'imageType',i.image_type,'grnItemId',i.grn_item_id,'displayOrder',i.display_order,'path',i.storage_path,'fileName',i.original_filename,'fileSize',i.file_size,'mimeType',i.mime_type,'uploadedBy',i.uploaded_by,'status',i.status,'tokenPresent',i.upload_token IS NOT NULL,'staticSHA256',encode(extensions.digest((to_jsonb(i)-'status'-'upload_token'-'updated_at')::text,'sha256'),'hex')) ORDER BY i.id),'[]') FROM public.grn_images i WHERE grn_id='${c.grnId}'),
 'objects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'bucket',o.bucket_id,'name',o.name,'rowSHA256',encode(extensions.digest(to_jsonb(o)::text,'sha256'),'hex')) ORDER BY o.id),'[]') FROM storage.objects o),
 'target',`);
}
export function bImageSnapshot(c,env,execute=spawnSync){
 const q=execute('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:bImageSnapshotSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});
 assert.equal(q.status,0,'Owned readonly B image snapshot failed');return JSON.parse(q.stdout);
}
