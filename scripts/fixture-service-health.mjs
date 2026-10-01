import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

export function managedUnitNames(units) {
  assert.ok(units && typeof units === 'object');
  assert.deepEqual(Object.keys(units).sort(), ['core', 'fault', 'switch']);
  return ['core', 'switch', 'fault'].map(role => {
    const unit = units[role];
    assert.ok(typeof unit === 'string' && new RegExp(`^warehouse-fixture-${role}-[a-z0-9][a-z0-9-]{0,39}\\.service$`).test(unit),
      'Explicit scoped fixture unit required');
    return unit;
  });
}
export function assertHelperState(text) {
  const p = Object.fromEntries(text.trim().split('\n').map(line => line.split('=')));
  assert.ok(p.ActiveState === 'active' && p.SubState === 'running' && Number(p.MainPID) > 0,
    'Supervised fixture helper is unavailable');
  assert.ok(p.Restart === 'no' && p.NRestarts === '0' && p.KillMode === 'control-group',
    'Helper restart or process ownership differs from the reviewed run');
}
export function verifyManagedHelpers(units) {
  for (const unit of managedUnitNames(units)) {
    const r = spawnSync('systemctl', ['--user', 'show', unit, '--property=ActiveState,SubState,MainPID,Restart,NRestarts,KillMode'],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 16384 });
    assert.equal(r.status, 0, 'Supervised fixture status unavailable');
    assertHelperState(r.stdout);
  }
}
