import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMain } from './is-main.mjs';

const forbiddenEntry = /(^|\/)(\.env(?:\..*)?|[^/]+\.(?:pem|key|p12|pfx|jks|keystore|mobileprovision|sql|sqlite|sqlite3|db))$/i;
const allowedPublicCertificates = new Set(['assets/expo-root.pem']);
const forbiddenText = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=/,
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\/(?:ws|workspace)\//,
];

export function validateEntries(entries) {
  const unsafe = entries.filter(name => name.startsWith('/') || name.split('/').includes('..') || (forbiddenEntry.test(name) && !allowedPublicCertificates.has(name)));
  if (unsafe.length) throw new Error(`Artifact contains forbidden path(s): ${unsafe.slice(0, 5).join(', ')}`);
  return entries;
}

export function validateText(text) {
  const match = forbiddenText.find(pattern => pattern.test(text));
  if (match) throw new Error(`Artifact contains forbidden secret or workstation-path pattern: ${match}`);
}

/**
 * Every permission the built app is expected to request. Anything else in the
 * merged manifest fails the audit: a dependency or SDK upgrade can add a
 * permission (location, contacts, phone state, notifications, advertising id)
 * without any change in this repository, and a list of forbidden names cannot
 * know about the ones nobody thought of.
 *
 * Add a name here only after reviewing why the app needs it, in the same change
 * that introduces it. Where each one comes from today:
 *   CAMERA                  expo-camera, expo-image-picker (QR codes, GRN and dispatch photos)
 *   INTERNET                the app itself
 *   ACCESS_NETWORK_STATE    @react-native-community/netinfo, expo-image, expo-updates
 *   ACCESS_WIFI_STATE       @react-native-community/netinfo
 *   USE_BIOMETRIC,
 *   USE_FINGERPRINT         expo-local-authentication (app lock)
 *   VIBRATE                 expo-haptics
 *   SYSTEM_ALERT_WINDOW     the Expo prebuild template (React Native's developer overlay)
 */
export const EXPECTED_ANDROID_PERMISSIONS = [
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CAMERA',
  'android.permission.INTERNET',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'android.permission.VIBRATE',
];

/**
 * Permissions the app declares for itself, by suffix of its own package name.
 * androidx.core adds this one to every app so its runtime receivers are not exported.
 */
const OWN_PACKAGE_PERMISSIONS = ['DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'];

/** Every permission name in `aapt dump permissions` output, whatever its namespace. */
function permissionNames(output) {
  const used = [...output.matchAll(/^\s*uses-permission(?:-sdk-\d+)?:\s*(?:name=)?'?([A-Za-z0-9_.]+)'?/gm)].map(match => match[1]);
  const declared = [...output.matchAll(/^\s*permission:\s*(?:name=)?'?([A-Za-z0-9_.]+)'?/gm)].map(match => match[1]);
  return new Set([...used, ...declared]);
}

export function validatePermissions(output, blocked, { requireCamera = true, allowed = EXPECTED_ANDROID_PERMISSIONS, packageName } = {}) {
  const permissions = permissionNames(output);
  const presentBlocked = blocked.filter(permission => permissions.has(permission));
  if (presentBlocked.length) throw new Error(`Blocked Android permission(s) present: ${presentBlocked.join(', ')}`);
  const expected = new Set([...allowed, ...(packageName ? OWN_PACKAGE_PERMISSIONS.map(suffix => `${packageName}.${suffix}`) : [])]);
  const unexpected = [...permissions].filter(permission => !expected.has(permission)).sort();
  if (unexpected.length) {
    throw new Error(
      `Unexpected Android permission(s) present: ${unexpected.join(', ')}. ` +
      'Find the dependency that adds each one, decide whether the app needs it, and either block it ' +
      '(app.json android.blockedPermissions) or add it to EXPECTED_ANDROID_PERMISSIONS in scripts/artifact-audit.mjs.'
    );
  }
  if (requireCamera && !permissions.has('android.permission.CAMERA')) throw new Error('Expected Android camera permission is missing.');
  return [...permissions].sort();
}

/**
 * The built app must say `android:allowBackup="false"`. Without the attribute
 * Android backs the app's data up to the user's Google account and lets it be
 * moved to another phone, outside the facility's control. Takes the output of
 * `aapt2 dump xmltree --file AndroidManifest.xml` or `aapt dump xmltree`.
 */
export function validateBackup(output) {
  const match = /android:allowBackup\(0x01010280\)=(\S+(?: \S+)?)/.exec(output);
  const value = match?.[1];
  const off = value === 'false' || /^\(type 0x12\)0x0+$/.test(value ?? '');
  if (!off) {
    throw new Error(
      `Android backup is not turned off (android:allowBackup is ${value ?? 'not set'}). ` +
      'Set "allowBackup": false under expo.android in app.json and rebuild.'
    );
  }
  return false;
}

function filesUnder(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesUnder(join(directory, entry.name), relative) : [relative];
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options });
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim().slice(-4000);
    throw new Error(`${command} failed${detail ? `: ${detail}` : ` with status ${result.status ?? 'unknown'}`}`);
  }
  return result.stdout;
}

function scanArchiveText(artifact, entries) {
  const textEntries = entries.filter(name =>
    name.startsWith('assets/') || /\.(?:js|json|xml|txt|properties|pem|crt|html|css|map|version)$/i.test(name));
  for (const name of textEntries) {
    if (/\.(?:png|jpe?g|webp|gif|ttf|otf)$/i.test(name)) continue;
    validateText(run('unzip', ['-p', artifact, name], { encoding: 'latin1' }));
  }
}

function findAapt() {
  if (process.env.AAPT && existsSync(process.env.AAPT)) return process.env.AAPT;
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return null;
  const root = join(sdk, 'build-tools');
  if (!existsSync(root)) return null;
  for (const version of readdirSync(root).sort().reverse()) {
    for (const binary of ['aapt2', 'aapt']) {
      const candidate = join(root, version, binary);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function auditArtifact(input, root = resolve(new URL('..', import.meta.url).pathname)) {
  const artifact = resolve(input);
  if (!existsSync(artifact)) throw new Error(`Artifact does not exist: ${artifact}`);
  const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
  const blocked = app.android.blockedPermissions;
  let entries;
  let permissions = [];
  let digest = null;
  if (statSync(artifact).isDirectory()) {
    entries = validateEntries(filesUnder(artifact));
    for (const name of entries) {
      const path = join(artifact, name);
      if (statSync(path).size <= 10 * 1024 * 1024) validateText(readFileSync(path).toString('latin1'));
    }
  } else if (artifact.endsWith('.apk')) {
    entries = validateEntries(run('unzip', ['-Z1', artifact]).trim().split('\n').filter(Boolean));
    scanArchiveText(artifact, entries);
    const aapt = findAapt();
    if (!aapt) throw new Error('Android build-tools aapt/aapt2 is required to verify manifest permissions.');
    const args = basename(aapt) === 'aapt2' ? ['dump', 'permissions', artifact] : ['dump', 'permissions', artifact];
    permissions = validatePermissions(run(aapt, args), blocked, { packageName: app.android.package });
    const manifestArgs = basename(aapt) === 'aapt2'
      ? ['dump', 'xmltree', '--file', 'AndroidManifest.xml', artifact]
      : ['dump', 'xmltree', artifact, 'AndroidManifest.xml'];
    validateBackup(run(aapt, manifestArgs));
    digest = createHash('sha256').update(readFileSync(artifact)).digest('hex');
  } else {
    throw new Error('Audit accepts an Android APK or an exported bundle directory.');
  }
  const fonts = entries.filter(name => /\.(?:ttf|otf)$/i.test(name));
  if (fonts.length) {
    const notices = readFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    if (!notices.includes('@expo/vector-icons') || !notices.includes('react-native-vector-icons')) throw new Error('Bundled icon fonts are missing attribution notices.');
  }
  const publicCertificates = entries.filter(name => allowedPublicCertificates.has(name));
  return { artifact, sha256: digest, entries: entries.length, fonts, publicCertificates, permissions };
}

if (isMain(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: npm run audit:artifact -- PATH_TO_APK_OR_EXPORT_DIRECTORY');
  const result = auditArtifact(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
}
