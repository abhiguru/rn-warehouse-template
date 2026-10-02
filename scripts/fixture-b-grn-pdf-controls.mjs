import assert from 'node:assert/strict';import{navigationConfig,customerBGRNPDFMode,navigationSnapshotSQL,navigationBefore}from'./fixture-navigation-guards.mjs';
export function bGRNPDFConfig(c){navigationConfig(c);assert.equal(customerBGRNPDFMode(c),true);return c;}
export function bGRNPDFHeader(c){bGRNPDFConfig(c);return{id:c.grnId,number:'FXC702',customerId:'a8246002-bdb6-11f1-b1bf-07b1deb5bca2',customerName:'Backend Test Customer B',assigned:true};}

export function bGRNPDFQuery(c){
 bGRNPDFConfig(c);
    const prefix=`grn/${c.grnId}/`;
    const original='FROM storage.objects o)';let sql=navigationSnapshotSQL(c);assert.equal(sql.split(original).length,2);
    sql=sql.replace(original,`FROM storage.objects o WHERE NOT (bucket_id='documents' AND name LIKE '${prefix}%'))`);
    sql=sql.replace('COMMIT;',`SELECT jsonb_build_object('header',(SELECT jsonb_build_object('id',g.id,'number',g.gr_no,'customerId',g.customer_id,'customerName',x.name,'assigned',EXISTS(SELECT 1 FROM public.users_customers_new WHERE customer_id=g.customer_id AND user_profile_id='${c.profileId}' AND active)) FROM public.goodsreceived g JOIN public.customers x ON x.id=g.customer_id WHERE g.id='${c.grnId}'),
     'documents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'size',(o.metadata->>'size')::bigint,'mime',o.metadata->>'mimetype','rowHash',encode(extensions.digest(to_jsonb(o)::text,'sha256'),'hex')) ORDER BY o.id),'[]') FROM storage.objects o WHERE bucket_id='documents' AND name LIKE '${prefix}%'));COMMIT;`);
 return {prefix,sql};
}
export function bGRNPDFBefore(c,snapshot,details){assert.deepEqual(details.header,bGRNPDFHeader(c));navigationBefore(c,snapshot);}
