// Optional read-only preflight for a reviewed private nine-block fictional plan.
// A config/plan is executable input; keep all bindings and guards intact.
import assert from 'node:assert/strict';
import { readFileSync, lstatSync, statfsSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { request } from 'node:https';
import { validateCertificateHorizon } from './prepare-emulator-fixture.mjs';
import { pathToFileURL } from 'node:url';
import { resolve, isAbsolute } from 'node:path';
import { createConnection } from 'node:net';
import { isMain } from './is-main.mjs';
import { verifyManagedHelpers } from './fixture-service-health.mjs';
export async function validateSoakEnvironment(configPath) {
  process.umask(0o077);
  assert.ok(configPath && isAbsolute(configPath));
  const st = lstatSync(configPath);
  assert.ok(
    st.isFile() &&
      !st.isSymbolicLink() &&
      st.uid === process.getuid() &&
      (st.mode & 0o077) === 0
  );
  const c = JSON.parse(readFileSync(configPath));
  process.env.PATH = resolve(c.node, '..') + ':' + process.env.PATH;
  assert.equal(c.scope, 'isolated-fictional-fixture');
  verifyManagedHelpers(c.managedUnits);
  const parent = lstatSync(c.privateRoot);
  assert.ok(
    parent.isDirectory() &&
      !parent.isSymbolicLink() &&
      parent.uid === process.getuid() &&
      (parent.mode & 0o077) === 0
  );
  const { operatorFixture } = await import(
    pathToFileURL(resolve(c.backendCheckout, 'tests/operator-fixture.mjs')).href
  );
  const { switchingFixture } = await import(
    pathToFileURL(
      resolve(c.secondaryBackendCheckout, 'scripts/switch-fixture-common.mjs')
    ).href
  );
  process.env.WAREHOUSE_STATE_DIR = c.backendState;
  const primary = operatorFixture();
  const savedState = process.env.WAREHOUSE_STATE_DIR;
  process.env.WAREHOUSE_STATE_DIR = c.secondaryBackendState;
  let secondary;
  try {
    secondary = switchingFixture();
  } finally {
    process.env.WAREHOUSE_STATE_DIR = savedState;
  }
  const i = JSON.parse(readFileSync(c.emulatorInputs));
  assert.ok(
    i.createdOnlyForUnattendedFixtures && /^emulator-\d+$/.test(i.serial)
  );
  assert.equal(i.artifact.versionCode, c.versionCode);
  assert.equal(i.artifact.source, c.mobileSource);
  assert.equal(i.artifact.sha256, c.apkSHA256);
  assert.equal(
    createHash('sha256').update(readFileSync(i.artifact.path)).digest('hex'),
    i.artifact.sha256
  );
  const disk = statfsSync(c.backendState);
  assert.ok(Number(disk.bavail) * Number(disk.bsize) > 10 * 1024 ** 3);
  const memory = readFileSync('/proc/meminfo', 'utf8');
  assert.ok(Number(memory.match(/^MemAvailable:\s+(\d+)/m)[1]) > 3 * 1024 ** 2);
  assert.ok(existsSync('/dev/kvm'));
  const startPath = c.startRecord;
  const horizon = existsSync(startPath)
    ? Math.max(
        1,
        (JSON.parse(readFileSync(startPath)).plannedEndMillis +
          3600000 -
          Date.now()) /
          3600000
      )
    : 10;
  assert.ok(horizon <= 12, 'Run window exceeded review budget');
  for (const [fixture, port, domain, company, tls] of [
    [
      primary,
      18443,
      'backend-core.example.test',
      'Fictional Core Warehouse',
      c.primaryCA,
    ],
    [
      secondary,
      18444,
      'backend-switch.example.test',
      'Fictional Switching Warehouse',
      c.secondaryCA,
    ],
  ]) {
    const ca = readFileSync(tls);
    validateCertificateHorizon(ca, horizon);
    const d = await new Promise((resolve, reject) => {
      const q = request(
        {
          hostname: '127.0.0.1',
          port,
          servername: domain,
          path: '/functions/v1/get-public-config',
          ca,
          timeout: 10000,
          headers: { Host: domain },
        },
        r => {
          let data = '';
          r.setEncoding('utf8');
          r.on('data', x => {
            data += x;
            if (data.length > 100000)
              q.destroy(new Error('Oversized discovery'));
          });
          r.on('end', () => {
            try {
              assert.equal(r.statusCode, 200);
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      q.on('timeout', () =>
        q.destroy(new Error('Fixture TLS discovery timeout'))
      );
      q.on('error', reject);
      q.end();
    });
    assert.equal(d.success, true);
    assert.equal(d.data.companyName, company);
    assert.equal(d.data.canonicalOrigin, 'https://' + domain);
    assert.equal(
      d.data.instanceId,
      JSON.parse(readFileSync(fixture.env.WAREHOUSE_MANIFEST_PATH)).instanceId
    );
  }
  function adb(args) {
    const r = spawnSync(c.adb, ['-s', i.serial, ...args], {
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(r.status, 0, 'Owned ADB read-only preflight failed');
    return r.stdout.trim();
  }
  assert.ok(adb(['emu', 'avd', 'name']).includes('TestWarehouseFixture_API30'));
  assert.equal(adb(['shell', 'getprop', 'ro.build.version.sdk']), '30');
  assert.equal(adb(['shell', 'getenforce']), 'Enforcing');
  assert.ok(
    adb(['shell', 'dumpsys', 'package', i.artifact.package]).includes(
      'versionCode=' + c.versionCode
    )
  );
  const remote = adb(['shell', 'pm', 'path', i.artifact.package]);
  assert.match(remote, /^package:\/data\/app\/[^\n]+$/);
  assert.equal(
    adb(['shell', 'sha256sum', remote.slice(8)]).split(/\s+/)[0],
    i.artifact.sha256
  );
  const hosts = adb(['exec-out', 'cat', '/system/etc/hosts']);
  assert.ok(
    hosts.includes('127.0.0.1 backend-core.example.test') &&
      hosts.includes('10.0.2.2 backend-switch.example.test')
  );
  assert.ok(adb(['reverse', '--list']).includes('tcp:443 tcp:18443'));
  assert.equal(
    adb(['shell', 'sha256sum', i.uiCapture.remotePath]).split(/\s+/)[0],
    i.uiCapture.sha256
  );
  const window = adb(['shell', 'dumpsys', 'window']);
  assert.ok(!window.includes('Application Not Responding'));
  assert.ok(!/am_anr|am_crash/.test(adb(['logcat', '-b', 'events', '-d'])));
  assert.ok(
    !/FATAL EXCEPTION|Fatal signal/.test(adb(['logcat', '-b', 'crash', '-d']))
  );
  const ss = spawnSync('/usr/bin/ss', ['-ltn'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(ss.status, 0);
  assert.ok(!/:8081\b/.test(ss.stdout), 'Metro occupancy is a blocker');
  const ctl = await readFaultState(c.faultSocket);
  assert.equal(ctl.state, 'DISARMED');
  for (const file of c.prerequisites ?? []) {
    const d = JSON.parse(readFileSync(file));
    assert.equal(d.status, 'PASS', 'Prerequisite failed or incomplete');
    if (d.sha256) assert.equal(d.sha256, c.apkSHA256);
    if (d.artifact) {
      assert.equal(d.artifact.sha256, c.apkSHA256);
    }
  }  console.log(
    'PASS strict independent fixture ownership/TLS identity, remaining run CA horizon, exact installed APK/route/snapshot, resources, no Metro, no ANR/crash and relay disarmed'
  );


}
export async function readFaultState(socketPath) {
  return new Promise((resolveReply, reject) => {
    let buffer = '';
    const conn = createConnection(socketPath);
    conn.setTimeout(5000, () => conn.destroy(new Error('Control timeout')));
    conn.on('error', reject);
    conn.on('connect', () => conn.write('{"action":"status"}\n'));
    conn.on('data', x => {
      buffer += x;
      if (buffer.length > 8192)
        conn.destroy(new Error('Oversized control reply'));
    });
    conn.on('end', () => {
      try {
        const d = JSON.parse(buffer);
        assert.ok(typeof d.state === 'string');
        resolveReply(d);
      } catch (e) {
        reject(e);
      }
    });
  });
}
if (isMain(import.meta.url)) await validateSoakEnvironment(process.argv[2]);
