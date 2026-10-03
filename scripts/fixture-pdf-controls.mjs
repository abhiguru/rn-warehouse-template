import assert from 'node:assert/strict';
export function pdfInvoice(c){assert.match(c.invoiceId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);const expected=c.invoiceNumber===20261001?{total:147,tax:7}:c.invoiceNumber===20261010?{total:179,tax:9}:null;assert.ok(expected,'Unreserved invoice refused');assert.equal(c.invoiceTotal,expected.total);assert.equal(c.invoiceTax,expected.tax);if(c.invoiceNumber===20261010)assert.equal(c.invoiceId,'b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c');return {id:c.invoiceId,number:c.invoiceNumber,year:2026,...expected};}

export function pdfNavigation(c){
 if(Object.hasOwn(c,'currentSupervisorPDF'))assert.equal(typeof c.currentSupervisorPDF,'boolean');
 if(c.currentSupervisorPDF!==true)return c;
 assert.equal(c.scope,'isolated-fictional-navigation-case');assert.equal(c.case,'same-server');assert.equal(c.kind,'native-pdf-send');
 assert.equal(c.reservedCustomerPDF,false);assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');
 assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
 assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.invoiceNumber,20261010);pdfInvoice(c);
 return {...c,case:'supervisor-reads'};
}
