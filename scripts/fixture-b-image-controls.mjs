import assert from 'node:assert/strict';
import {bApprovalConfig,bApprovalBefore,bApprovalAfterLogin,bApprovalAfterLogout} from './fixture-b-approval-controls.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const authConfig=c=>({...c,scope:'isolated-fictional-b-approval'});
export function bImageConfig(c){
 assert.equal(c.scope,'isolated-fictional-b-image-preparation');assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');bApprovalConfig(authConfig(c));
 assert.equal(c.grnId,'a24c256a-bdf3-11f1-97aa-57de57b8fb69');assert.equal(c.record,'FXC702');
 assert.equal(c.fileName,'fixture-b-0109.png');assert.equal(c.mimeType,'image/png');
 assert.equal(c.fileSize,160);assert.equal(c.imageSHA256,'d4575f91c6f9ed6eac9dc6da8fca4d5a016fe481c4e82887bbba35f98f83029d');return c;
}
export function bImageBefore(c,s){
 bImageConfig(c);bApprovalBefore(authConfig(c),s);
 assert.deepEqual(s.receipt,{id:c.grnId,record:c.record,customerId:c.customerId});
 assert.deepEqual(s.images,[]);assert.ok(Array.isArray(s.objects));
 const seen=new Set();for(const o of s.objects){assert.match(o.id,uuid);assert.match(o.rowSHA256,hash);assert.ok(!seen.has(o.id));seen.add(o.id);}
}
export function bImageAuthenticated(c,b,a){bImageBefore(c,b);assert.deepEqual(a.images,b.images);assert.deepEqual(a.objects,b.objects);assert.deepEqual(a.receipt,b.receipt);return bApprovalAfterLogin(authConfig(c),b,a);}
function authPreserved(b,a){
 for(const k of ['target','targetStaticHash','targetSessions','assignments','admin','adminStaticHash','adminSessions','targetOTPCount','adminOTPCount','adminHourly','adminDaily','otherAuthHash','businessHash','receipt'])assert.deepEqual(a[k],b[k],'Image preparation changed preserved '+k);
}
export function bImageRegistered(c,b,a,r){
 bImageConfig(c);assert.match(r.image_id,uuid);assert.match(r.upload_token,uuid);
 assert.match(r.storage_path,new RegExp('^headers/'+c.grnId+'/[a-f0-9-]{36}_fixture-b-0109\\.png$'));
 authPreserved(b,a);assert.deepEqual(a.objects,b.objects);assert.equal(a.images.length,1);const image=a.images[0];
 assert.deepEqual({...image,staticSHA256:undefined},{id:r.image_id,grnId:c.grnId,imageType:'header',grnItemId:null,displayOrder:0,path:r.storage_path,fileName:c.fileName,fileSize:c.fileSize,mimeType:c.mimeType,uploadedBy:c.adminProfileId,status:'pending',tokenPresent:true,staticSHA256:undefined});assert.match(image.staticSHA256,hash);
}
export function bImageUploaded(c,b,a){
 bImageConfig(c);authPreserved(b,a);assert.deepEqual(a.images,b.images);
 const old=new Set(b.objects.map(x=>x.id));assert.deepEqual(a.objects.filter(x=>old.has(x.id)),b.objects);
 const added=a.objects.filter(x=>!old.has(x.id));assert.equal(added.length,1);assert.match(added[0].id,uuid);assert.match(added[0].rowSHA256,hash);assert.equal(added[0].bucket,'grn-images');assert.equal(added[0].name,b.images[0].path);
}
export function bImageConfirmed(c,b,a){bImageConfig(c);authPreserved(b,a);assert.deepEqual(a.objects,b.objects);assert.deepEqual(a.images,[{...b.images[0],status:'confirmed',tokenPresent:false}]);}
export function bImageLoggedOut(c,b,a,id){bImageConfig(c);assert.deepEqual(a.images,b.images);assert.deepEqual(a.objects,b.objects);assert.deepEqual(a.receipt,b.receipt);bApprovalAfterLogout(authConfig(c),b,a,id);}
