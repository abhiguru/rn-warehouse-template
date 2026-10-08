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

export function validatePermissions(output, blocked, { requireCamera = true } = {}) {
  const permissions = new Set([...output.matchAll(/(?:uses-permission(?:: name=)?|permission: )'?(android\.permission\.[A-Z0-9_]+)/g)].map(match => match[1]));
  const presentBlocked = blocked.filter(permission => permissions.has(permission));
  if (presentBlocked.length) throw new Error(`Blocked Android permission(s) present: ${presentBlocked.join(', ')}`);
  if (requireCamera && !permissions.has('android.permission.CAMERA')) throw new Error('Expected Android camera permission is missing.');
  return [...permissions].sort();
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
    permissions = validatePermissions(run(aapt, args), blocked);
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
