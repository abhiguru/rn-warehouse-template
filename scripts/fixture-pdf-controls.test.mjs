import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import{pdfInvoice}from'./fixture-pdf-controls.mjs';
const c={invoiceId:'b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c',invoiceNumber:20261010,invoiceTotal:179,invoiceTax:9};
test('binds the already-saved rounding invoice without accepting arbitrary records or arithmetic',()=>{assert.equal(pdfInvoice(c).total,179);for(const edit of [{invoiceNumber:20261011},{invoiceTotal:178.5},{invoiceTax:8.5},{invoiceId:'00000000-0000-4000-8000-000000000000'}])assert.throws(()=>pdfInvoice({...c,...edit}));});
test('preserves the original independently scoped147 invoice contract',()=>{assert.equal(pdfInvoice({...c,invoiceNumber:20261001,invoiceTotal:147,invoiceTax:7}).tax,7);assert.throws(()=>pdfInvoice({...c,invoiceNumber:20261001}));});

test('prior device PDF preservation refuses unowned paths, artifacts and role modes',()=>{
 const q=spawnSync('python3',['-B','-m','unittest','test_pdf_device_preservation.py'],{cwd:fileURLToPath(new URL('./fixture-ui/',import.meta.url)),encoding:'utf8',timeout:15000});assert.equal(q.status,0,q.stderr);
});
