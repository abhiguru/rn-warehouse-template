import assert from 'node:assert/strict';
import {customerLateDiscoveryMode,navigationConfig} from './fixture-navigation-guards.mjs';

export function lateDiscoveryConfig(c) {
  navigationConfig(c);assert.equal(customerLateDiscoveryMode(c),true);return c;
}

// Consume only the new, bounded slice of a hash-bound switching helper log.
// Return transport metadata only; never retain arbitrary log properties.
export function lateDiscoveryEvents(text) {
  assert.equal(typeof text, 'string');
  assert.ok(Buffer.byteLength(text) <= 65536, 'Bounded helper observation required');
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const value = JSON.parse(line);
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    if (value.path !== '/functions/v1/get-public-config') continue;
    assert.equal(value.method, 'GET');
    assert.ok(Number.isFinite(Date.parse(value.atUTC)));
    assert.ok(['discovery-delay-start', 'complete'].includes(value.event), 'Discovery transport failed');
    assert.equal(value.status, 200);
    if (value.event === 'discovery-delay-start') assert.equal(value.delayMs, 3000);
    events.push({atUTC: value.atUTC, event: value.event, status: 200,
      ...(value.event === 'discovery-delay-start' ? {delayMs: 3000} : {})});
  }
  return events;
}

export function lateDiscoveryOrdering(events, leftAtUTC) {
  assert.equal(events.length, 2, 'Exactly one genuine discovery required');
  const [start, complete] = events;
  assert.equal(start.event, 'discovery-delay-start');
  assert.equal(complete.event, 'complete');
  assert.equal(start.delayMs, 3000);
  assert.equal(start.status, 200); assert.equal(complete.status, 200);
  const began = Date.parse(start.atUTC), left = Date.parse(leftAtUTC), ended = Date.parse(complete.atUTC);
  assert.ok([began, left, ended].every(Number.isFinite));
  assert.ok(began < left && left < ended, 'Must leave before genuine response completes');
  assert.ok(ended - began >= 2900 && ended - began <= 10000, 'Bounded actual delay required');
  return {status: 'PASS', delayStartedAtUTC: start.atUTC, leftAtUTC, completedAtUTC: complete.atUTC};
}
