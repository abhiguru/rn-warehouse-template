import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
export function customerLifecycleMode(c) {
  if (Object.hasOwn(c,'reservedCustomerLifecycle')) assert.equal(typeof c.reservedCustomerLifecycle,'boolean');
  const enabled=c.reservedCustomerLifecycle===true;
  if (enabled) {
    assert.equal(c.case,'cold-lifecycle');
    assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');
    assert.equal(c.profileName,'New customer');
  }
  return enabled;
}
export function customerPDFMode(c) {
  if(Object.hasOwn(c,'reservedCustomerPDF'))assert.equal(typeof c.reservedCustomerPDF,'boolean');
  const enabled=c.reservedCustomerPDF===true;
  if(enabled){
    assert.equal(c.case,'same-server');assert.equal(c.kind,'native-pdf-send');
    assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');
    assert.equal(c.profileName,'New customer');
    assert.equal(c.invoiceId,'b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c');
    assert.equal(c.invoiceNumber,20261010);
  }
  return enabled;
}
export function customerOfflineMode(c) {
  if(Object.hasOwn(c,'reservedCustomerOffline'))assert.equal(typeof c.reservedCustomerOffline,'boolean');
  const enabled=c.reservedCustomerOffline===true;
  if(enabled){assert.equal(c.case,'offline-orders');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');}
  if(Object.hasOwn(c,'rapidNetworkCycles')){
    assert.equal(c.rapidNetworkCycles,3);assert.equal(enabled,true);
    assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
  }
  return enabled;
}
export function customerReceiptDenialMode(c) {
  if(Object.hasOwn(c,'reservedCustomerReceiptDenial'))assert.equal(typeof c.reservedCustomerReceiptDenial,'boolean');
  const enabled=c.reservedCustomerReceiptDenial===true;
  if(enabled){
    assert.equal(c.case,'same-server');assert.equal(c.kind,'native-receipt-denial');
    assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
    assert.equal(c.targetReceiptId,'a24c256a-bdf3-11f1-97aa-57de57b8fb69');
  }
  return enabled;
}
export function genuineAInvoiceDenialMode(c){
 if(Object.hasOwn(c,'genuineCustomerAInvoiceDenial'))assert.equal(typeof c.genuineCustomerAInvoiceDenial,'boolean');const enabled=c.genuineCustomerAInvoiceDenial===true;
 if(enabled){assert.equal(c.case,'same-server');assert.equal(c.kind,'native-genuine-a-invoice-denial');assert.equal(c.profileId,'79764e1a-3aed-4cac-9a25-42ccdafb79ac');assert.equal(c.profileName,'Customer A');assert.match(c.targetInvoiceId,uuid);assert.equal(c.targetInvoiceNumber,20261031);assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');assert.equal(c.noAutomaticRetry,true);assert.ok([1,2,3].includes(c.nativeAttempt));for(const k of ['customerBInvoiceDenial','genuineCustomerAReceiptDenial','reservedCustomerReceiptDenial','reciprocalCustomerReceiptDenial','reservedCustomerPDF'])assert.notEqual(c[k],true);}
 return enabled;
}
export function genuineAReceiptDenialMode(c) {
 if(Object.hasOwn(c,'genuineCustomerAReceiptDenial'))assert.equal(typeof c.genuineCustomerAReceiptDenial,'boolean');
 const enabled=c.genuineCustomerAReceiptDenial===true;
 if(enabled){
  assert.equal(c.case,'same-server');assert.equal(c.kind,'native-genuine-a-receipt-denial');
  assert.equal(c.profileId,'79764e1a-3aed-4cac-9a25-42ccdafb79ac');assert.equal(c.profileName,'Customer A');
  assert.equal(c.targetReceiptId,'a24c256a-bdf3-11f1-97aa-57de57b8fb69');
  assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
  assert.equal(c.noAutomaticRetry,true);assert.ok([1,2,3].includes(c.nativeAttempt));
  for(const k of ['reservedCustomerReceiptDenial','reciprocalCustomerReceiptDenial','customerBInvoiceDenial'])assert.notEqual(c[k],true);
 }
 return enabled;
}
export function reciprocalReceiptDenialMode(c) {
 if(Object.hasOwn(c,'reciprocalCustomerReceiptDenial'))assert.equal(typeof c.reciprocalCustomerReceiptDenial,'boolean');
 const enabled=c.reciprocalCustomerReceiptDenial===true;
 if(enabled){
  assert.equal(c.reservedCustomerReceiptDenial===true,false);assert.equal(c.case,'same-server');assert.equal(c.kind,'native-reciprocal-receipt-denial');
  assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');assert.equal(c.profileName,'Customer B');
  assert.equal(c.targetReceiptId,'a2489c56-bdf3-11f1-97a8-8b3d06ae4c97');
  assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
 }
 return enabled;
}
export function customerInvoiceDenialMode(c) {
 if(Object.hasOwn(c,'customerBInvoiceDenial'))assert.equal(typeof c.customerBInvoiceDenial,'boolean');
 const enabled=c.customerBInvoiceDenial===true;
 if(enabled){
  assert.equal(c.case,'same-server');assert.equal(c.kind,'native-invoice-denial');
  assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');assert.equal(c.profileName,'Customer B');
  assert.equal(c.targetInvoiceId,'b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c');
  assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
 }
 return enabled;
}
export function customerLateDiscoveryMode(c) {
  if(Object.hasOwn(c,'reservedCustomerLateDiscovery'))assert.equal(typeof c.reservedCustomerLateDiscovery,'boolean');
  const enabled=c.reservedCustomerLateDiscovery===true;
  if(enabled){
    assert.equal(c.case,'same-server');assert.equal(c.kind,'native-late-discovery');
    assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
    assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
    assert.equal(c.targetOrigin,'https://backend-switch.example.test');assert.equal(c.targetInstanceId,'c7ee3314-4dee-4361-81df-7821cdcb1b4a');
    assert.equal(c.discoveryDelayMs,3000);
    assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
  }
  return enabled;
}
export function customerCompatibilityMode(c) {
 if(Object.hasOwn(c,'reservedCustomerCompatibility'))assert.equal(typeof c.reservedCustomerCompatibility,'boolean');
 const enabled=c.reservedCustomerCompatibility===true;
 if(enabled){
  assert.equal(c.case,'same-server');assert.equal(c.kind,'native-compatibility-rejection');
  assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
  assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.targetOrigin,'https://backend-switch.example.test');assert.equal(c.targetInstanceId,'a6efd021-cbf2-42a2-bebf-281551614d93');
  assert.equal(c.minimumClientVersion,'0.2.0');
  assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
 }
 return enabled;
}
export function customerOrdersSelectionRaceMode(c){
 if(Object.hasOwn(c,'reservedCustomerOrdersSelectionRace'))assert.equal(typeof c.reservedCustomerOrdersSelectionRace,'boolean');
 const enabled=c.reservedCustomerOrdersSelectionRace===true;
 if(enabled){
  assert.equal(c.case,'orders-selection-response-race');assert.equal(c.kind,'native-orders-selection-response-race');
  assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
  assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.ordersReadDelayMs,5000);
  assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
 }
 return enabled;
}
export function customerBImageReadMode(c){
 if(Object.hasOwn(c,'customerBImageRead'))assert.equal(typeof c.customerBImageRead,'boolean');const enabled=c.customerBImageRead===true;
 if(enabled){assert.equal(c.case,'customer-b-image-read');assert.equal(c.kind,'native-customer-b-image-read');assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');assert.equal(c.profileName,'Customer B');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.targetReceiptId,'a24c256a-bdf3-11f1-97aa-57de57b8fb69');assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');}
 if(c.case==='customer-b-image-read')assert.equal(enabled,true);return enabled;
}
export function customerBGRNPDFMode(c){
 if(Object.hasOwn(c,'customerBGRNPDF'))assert.equal(typeof c.customerBGRNPDF,'boolean');const enabled=c.customerBGRNPDF===true;
 if(enabled){assert.equal(c.case,'customer-b-grn-pdf');assert.equal(c.kind,'native-customer-b-grn-pdf');assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');assert.equal(c.profileName,'Customer B');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.grnId,'a24c256a-bdf3-11f1-97aa-57de57b8fb69');assert.equal(c.grnNumber,'FXC702');assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');}
 if(c.case==='customer-b-grn-pdf')assert.equal(enabled,true);return enabled;
}
function customerReadMode(c) {
  const genuineA=genuineAReceiptDenialMode(c)||genuineAInvoiceDenialMode(c);const lifecycle=customerLifecycleMode(c),pdf=customerPDFMode(c),offline=customerOfflineMode(c),denial=customerReceiptDenialMode(c);
  const late=customerLateDiscoveryMode(c),discovery=customerDiscoveryMode(c),cancel=customerCancelSwitchMode(c),failure=customerDiscoveryFailureMode(c),reciprocal=reciprocalReceiptDenialMode(c),invoiceDenial=customerInvoiceDenialMode(c),compatibility=customerCompatibilityMode(c),ordersRace=customerOrdersSelectionRaceMode(c),bImage=customerBImageReadMode(c),bPDF=customerBGRNPDFMode(c);
  assert.ok([genuineA,lifecycle,pdf,offline,denial,late,discovery,cancel,failure,reciprocal,invoiceDenial,compatibility,ordersRace,bImage,bPDF].filter(Boolean).length<=1,'ONE_RESERVED_CUSTOMER_READ_MODE');return genuineA||lifecycle||pdf||offline||denial||late||discovery||cancel||failure||reciprocal||invoiceDenial||compatibility||ordersRace||bImage||bPDF;
}
export function customerDiscoveryFailureMode(c) {
  if(Object.hasOwn(c,'reservedCustomerDiscoveryFailure'))assert.equal(typeof c.reservedCustomerDiscoveryFailure,'boolean');
  const enabled=c.reservedCustomerDiscoveryFailure===true;
  if(enabled){
    assert.equal(c.case,'same-server');assert.equal(c.kind,'native-discovery-failure');
    assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
    assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
    assert.equal(c.targetOrigin,'https://backend-switch.example.test');assert.equal(c.targetInstanceId,'c7ee3314-4dee-4361-81df-7821cdcb1b4a');
    assert.equal(c.networkMarker,'whvm-discovery-0109-01');
    assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
  }
  return enabled;
}
export function customerCancelSwitchMode(c) {
  if(Object.hasOwn(c,'reservedCustomerCancelSwitch'))assert.equal(typeof c.reservedCustomerCancelSwitch,'boolean');
  const enabled=c.reservedCustomerCancelSwitch===true;
  if(enabled){
    assert.equal(c.case,'cancel-switch');assert.equal(c.kind,'native-customer-cancel-switch');
    assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
    assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
    assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
  }
  return enabled;
}
export function customerDiscoveryMode(c) {
  if(Object.hasOwn(c,'reservedCustomerDiscovery'))assert.equal(typeof c.reservedCustomerDiscovery,'boolean');
  const enabled=c.reservedCustomerDiscovery===true;
  if(enabled){
    assert.equal(c.case,'malformed-server');assert.equal(c.kind,'native-malformed-discovery');
    assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
    assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
    assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');
  }
  return enabled;
}
export function unsavedCustomerDraftMode(c){
 const enabled=c.case==='unsaved-customer-draft-cancel';
 if(enabled){
  assert.equal(c.kind,'native-unsaved-customer-draft');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
  assert.equal(c.draftMarker,'Fixture VM0109 unsaved customer');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.targetOrigin,'https://backend-switch.example.test');assert.equal(c.targetInstanceId,'c7ee3314-4dee-4361-81df-7821cdcb1b4a');
  assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');assert.equal(customerReadMode(c),false);
 }
 return enabled;
}
export function unsavedInvoiceDraftMode(c){
 const enabled=c.case==='unsaved-invoice-draft-cancel';
 if(enabled){
  assert.equal(c.kind,'native-unsaved-invoice-draft');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
  assert.equal(c.draftMarker,'20261991');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.targetOrigin,'https://backend-switch.example.test');assert.equal(c.targetInstanceId,'c7ee3314-4dee-4361-81df-7821cdcb1b4a');
  assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');assert.equal(customerReadMode(c),false);
 }
 return enabled;
}
export function unsavedGRNDraftMode(c){
 const enabled=c.case==='unsaved-grn-draft-cancel';
 if(enabled){
  assert.equal(c.kind,'native-unsaved-grn-draft');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
  assert.equal(c.draftMarker,'FXS991');assert.equal(c.expectedGeneratedNumber,'A0001');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.targetOrigin,'https://backend-switch.example.test');assert.equal(c.targetInstanceId,'c7ee3314-4dee-4361-81df-7821cdcb1b4a');
  assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');assert.equal(customerReadMode(c),false);
 }
 return enabled;
}
export function unsavedDispatchDraftMode(c){
 const enabled=c.case==='unsaved-dispatch-draft-cancel';
 if(enabled){
  assert.equal(c.kind,'native-unsaved-dispatch-draft');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
  assert.equal(c.draftMarker,'Fixture VM0109 unsaved dispatch');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.targetOrigin,'https://backend-switch.example.test');assert.equal(c.targetInstanceId,'c7ee3314-4dee-4361-81df-7821cdcb1b4a');
  assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');assert.equal(customerReadMode(c),false);
 }
 return enabled;
}
export function customerBLogoutMode(c){
 if(Object.hasOwn(c,'customerBLogout'))assert.equal(typeof c.customerBLogout,'boolean');const enabled=c.customerBLogout===true;
 if(enabled){assert.equal(c.case,'customer-b-logout');assert.equal(c.kind,'native-customer-b-session-cleanup');assert.equal(c.cleanupPurpose,'before-ordinary-b-rejection');assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');assert.equal(c.profileName,'Customer B');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');assert.equal(customerReadMode(c),false);}
 if(c.case==='customer-b-logout')assert.equal(enabled,true);return enabled;
}
export function genuineALogoutMode(c){
 if(Object.hasOwn(c,'genuineALogout'))assert.equal(typeof c.genuineALogout,'boolean');
 const enabled=c.genuineALogout===true;
 if(enabled){
  assert.equal(c.case,'customer-logout');assert.equal(c.kind,'native-genuine-a-logout');assert.equal(c.profileId,'79764e1a-3aed-4cac-9a25-42ccdafb79ac');assert.equal(c.profileName,'Customer A');
  assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
  assert.equal(c.noAutomaticRetry,true);assert.ok([1,2,3].includes(c.nativeAttempt));assert.equal(customerReadMode(c),false);assert.notEqual(c.customerBLogout,true);
 }
 return enabled;
}
export function navigationConfig(c) {
  const customerLifecycle=customerReadMode(c);genuineALogoutMode(c);const bLogout=customerBLogoutMode(c);unsavedCustomerDraftMode(c);unsavedInvoiceDraftMode(c);unsavedGRNDraftMode(c);unsavedDispatchDraftMode(c);
  assert.equal(c.scope, 'isolated-fictional-navigation-case');
  assert.ok(['offline-orders', 'same-server', 'cancel-switch', 'confirm-switch', 'switch-back', 'malformed-server', 'cold-lifecycle', 'ordinary-logout', 'customer-logout', 'staff-logout', 'staff-reads','supervisor-reads', 'supervisor-logout','unsaved-customer-draft-cancel','unsaved-invoice-draft-cancel','unsaved-grn-draft-cancel','unsaved-dispatch-draft-cancel','orders-selection-response-race','customer-b-logout','customer-b-image-read','customer-b-grn-pdf'].includes(c.case));
  for (const name of ['backendCheckout', 'backendState', 'soakConfig', 'artifactAudit', 'caseDirectory'])
    assert.ok(isAbsolute(c[name]), 'ABSOLUTE_CASE_PATH_REQUIRED');
  for (const name of ['instanceId', 'profileId', 'sessionId']) assert.match(c[name], uuid);
  for (const name of ['artifactSHA256', 'fixtureGuardSHA256']) assert.match(c[name], hash);
  assert.equal(c.profileName, genuineAReceiptDenialMode(c)||genuineAInvoiceDenialMode(c)||genuineALogoutMode(c) ? 'Customer A' : bLogout||reciprocalReceiptDenialMode(c)||customerInvoiceDenialMode(c)||customerBImageReadMode(c)||customerBGRNPDFMode(c) ? 'Customer B' : c.case === 'switch-back' ? 'Switch Demo Administrator' : customerLifecycle || ['customer-logout','staff-logout', 'staff-reads','supervisor-reads', 'supervisor-logout','unsaved-customer-draft-cancel','unsaved-invoice-draft-cancel','unsaved-grn-draft-cancel','unsaved-dispatch-draft-cancel'].includes(c.case) ? 'New customer' : 'Core Demo Administrator');
  if (['staff-logout','staff-reads','supervisor-reads','supervisor-logout'].includes(c.case)) assert.equal(c.profileId, '947136fa-997b-4a83-819d-1b8bd3ecba68');
  return c;
}

export function navigationSnapshotSQL(c) {
  navigationConfig(c);
  const customerLifecycle=customerReadMode(c);
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'profile',(SELECT jsonb_build_object('id',id,'active',active,'role',role,'name',name${customerBLogoutMode(c) ? ",'enrollmentStatus',enrollment_status" : ''})
   FROM public.user_profiles WHERE id='${c.profileId}' AND mobile='${genuineAReceiptDenialMode(c)||genuineAInvoiceDenialMode(c)||genuineALogoutMode(c) ? '919888888872' : customerBLogoutMode(c)||reciprocalReceiptDenialMode(c)||customerInvoiceDenialMode(c)||customerBImageReadMode(c)||customerBGRNPDFMode(c) ? '919888888873' : c.case === 'switch-back' ? '919888888881' : customerLifecycle || ['customer-logout','staff-logout', 'staff-reads','supervisor-reads', 'supervisor-logout','unsaved-customer-draft-cancel','unsaved-invoice-draft-cancel','unsaved-grn-draft-cancel','unsaved-dispatch-draft-cancel'].includes(c.case) ? '919888888874' : '919888888871'}'),
 'nativeSessionPresent',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s
   JOIN public.user_profiles p ON p.auth_user_id=s.user_id
   WHERE p.id='${c.profileId}' AND s.id='${c.sessionId}' AND s.expires_at>now()),
 'otpCount',(SELECT count(*) FROM public.otp_verifications),
 'otherAuthHash',encode(extensions.digest(jsonb_build_object(
   'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.user_profiles p),
   'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM warehouse_security.refresh_sessions s WHERE id<>'${c.sessionId}'),
   'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.users_customers_new a),
   'otps',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.otp_verifications a),
   'quotas',(SELECT jsonb_agg(to_jsonb(a) ORDER BY phone_number) FROM public.otp_rate_limits a),
   'enrollment',(SELECT jsonb_agg(to_jsonb(a) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens a)
 )::text,'sha256'),'hex'),
 'businessHash',encode(extensions.digest(jsonb_build_object(
   'receipts',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived g),
   'receiptLines',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived_trl g),
   'dispatch',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch d),
   'dispatchLines',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch_trl d),
   'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice i),
   'invoiceLines',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice_trl i),
   'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o),
   'orderItems',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.order_items o),
   'images',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.grn_images g),
   'dispatchImages',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.dispatch_images g),
   'idempotency',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.idempotency_keys g),
   'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o)
 )::text,'sha256'),'hex'));
COMMIT;`;
}

export function navigationBefore(c, s) {
  navigationConfig(c);
  const customerLifecycle=customerReadMode(c);
  assert.equal(s.profile?.id, c.profileId);
  assert.equal(s.profile?.name, c.profileName);
  assert.equal(s.profile?.role, customerBLogoutMode(c) || customerLifecycle || c.case === 'customer-logout' ? 'customer' : ['staff-logout','staff-reads'].includes(c.case) ? 'staff' : ['staff-reads','supervisor-reads','supervisor-logout','unsaved-customer-draft-cancel','unsaved-invoice-draft-cancel','unsaved-grn-draft-cancel','unsaved-dispatch-draft-cancel'].includes(c.case) ? 'supervisor' : 'admin');
  assert.equal(s.profile?.active, true);if(customerBLogoutMode(c))assert.equal(s.profile.enrollmentStatus,'approved');
  assert.equal(s.nativeSessionPresent, true, 'MATCHED_NATIVE_SESSION_REQUIRED');
  for (const name of ['businessHash', 'otherAuthHash']) assert.match(s[name], hash);
  assert.ok(Number.isSafeInteger(s.otpCount) && s.otpCount >= 0);
}

export function navigationAfter(c, before, after) {
  navigationBefore(c, before);
  for (const key of ['profile', 'businessHash', 'otherAuthHash', 'otpCount'])
    assert.deepEqual(after[key], before[key], 'UNEXPECTED_NAVIGATION_STATE_CHANGE');
  assert.equal(after.nativeSessionPresent, !['confirm-switch','switch-back','ordinary-logout','customer-logout','customer-b-logout', 'staff-logout', 'supervisor-logout'].includes(c.case),
    ['confirm-switch','switch-back','ordinary-logout','customer-logout','customer-b-logout', 'staff-logout', 'supervisor-logout'].includes(c.case) ? 'OLD_SESSION_NOT_REVOKED' : 'NATIVE_SESSION_LOST');
}
