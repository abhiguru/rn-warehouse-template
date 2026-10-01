import test from 'node:test';
import assert from 'node:assert/strict';
import { managedUnitNames, assertHelperState } from './fixture-service-health.mjs';
const units = Object.fromEntries(['core', 'switch', 'fault'].map(x => [x, `warehouse-fixture-${x}-diagnostic-1.service`]));
test('all three independent scoped dependencies are mandatory', () => {
  assert.equal(managedUnitNames(units).length, 3);
  assert.throws(() => managedUnitNames({ core: units.core }));
  assert.throws(() => managedUnitNames({ ...units, core: 'warehouse-test1-tunnel.service' }));
  assert.throws(() => managedUnitNames({ ...units, core: units.core + '\nRestart=always' }));
});
test('a dead or restarted helper cannot become a cached-UI PASS', () => {
  const good = 'ActiveState=active\nSubState=running\nMainPID=42\nRestart=no\nNRestarts=0\nKillMode=control-group';
  assertHelperState(good);
  for (const text of [good.replace('MainPID=42', 'MainPID=0'), good.replace('active', 'failed'),
    good.replace('NRestarts=0', 'NRestarts=1'), good.replace('Restart=no', 'Restart=always')])
    assert.throws(() => assertHelperState(text));
});
