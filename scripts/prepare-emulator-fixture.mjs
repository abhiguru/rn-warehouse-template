// Generated native overlay for one dedicated fictional emulator APK only.
// Runtime authentication and normal warehouse trust settings are untouched.
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { isMain } from './is-main.mjs';

export function validateCertificateHorizon(pem, hours, now = Date.now()) {
  assert.ok(Number.isFinite(hours) && hours > 0 && hours <= 168,
    'Certificate horizon must be more than zero and at most 168 hours');
  const ca = new X509Certificate(pem);
  assert.ok(Date.parse(ca.validFrom) <= now, 'Fixture certificate is not valid yet');
  assert.ok(Date.parse(ca.validTo) > now + hours * 3600000,
    'Fixture certificate expires before the requested run plus preparation/margin');
  return ca.validTo;
}

export function validateFixtureTarget(gradle, pem, now = Date.now()) {
  assert.match(gradle, /applicationId\s+["']in\.gurucold\.warehouse\.fixture["']/,
    'Refusing certificate overlay for a normal warehouse APK');
  const ca = new X509Certificate(pem);
  assert.equal(ca.checkHost('backend-core.example.test'), 'backend-core.example.test');
  assert.ok(ca.ca && Date.parse(ca.validFrom) <= now && Date.parse(ca.validTo) > now);
}

function main() {
const root = resolve(import.meta.dirname, '..');
const caPath = process.env.WAREHOUSE_FIXTURE_CA;
assert.ok(caPath && isAbsolute(caPath), 'Private local fixture certificate path required');
const st = lstatSync(caPath);
assert.ok(st.isFile() && !st.isSymbolicLink() && st.uid === process.getuid());
const pem = readFileSync(caPath);
// Include build/setup time and an explicit safety margin, not just suite time.
const hours = Number(process.env.WAREHOUSE_FIXTURE_MIN_VALID_HOURS ?? '12');
const expiry = validateCertificateHorizon(pem, hours);
if (process.argv.includes('--check-certificate')) {
  validateFixtureTarget('applicationId "in.gurucold.warehouse.fixture"', pem);
  console.log(`Fixture certificate covers ${hours} hours; expires ${expiry}`);
  return;
}
const app = resolve(root, 'android/app');
const gradle = readFileSync(resolve(app, 'build.gradle'), 'utf8');
validateFixtureTarget(gradle, pem);
const manifestPath = resolve(app, 'src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
assert.ok(!manifest.includes('android:networkSecurityConfig'), 'Existing trust policy must not be overwritten');
for (const dir of ['raw', 'xml']) mkdirSync(resolve(app, 'src/main/res', dir), { recursive: true });
// A public certificate is not key material. Keep its conventional .crt suffix
// so the normal artifact audit can still reject every unexpected .pem/key file.
writeFileSync(resolve(app, 'src/main/res/raw/warehouse_fixture_ca.crt'), pem);
writeFileSync(resolve(app, 'src/main/res/xml/warehouse_fixture_network_security.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">backend-core.example.test</domain>
    <trust-anchors><certificates src="@raw/warehouse_fixture_ca" /></trust-anchors>
  </domain-config>
</network-security-config>
`);
manifest = manifest.replace('<application ', '<application android:networkSecurityConfig="@xml/warehouse_fixture_network_security" ');
writeFileSync(manifestPath, manifest);
console.log('Dedicated fixture APK trusts its short-lived local certificate for the fictional fixture domain only.');
}
if (isMain(import.meta.url)) main();
