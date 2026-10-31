import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { supportedNode } from './doctor-common.mjs';

test('supportedNode accepts exactly the Node releases React Native and Expo support, from 22.18', () => {
  for (const version of ['22.18.0', '22.20.1', '24.3.0', '24.11.0', '26.0.0', '27.1.0']) assert.equal(supportedNode(version), true, version);
  for (const version of ['20.19.0', '22.17.9', '23.5.0', '24.2.9', '25.0.0', '25.8.1']) assert.equal(supportedNode(version), false, version);
});
test('package.json engines.node is the range supportedNode implements', () => {
  const { engines } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(engines.node, '^22.18.0 || ^24.3.0 || >=26.0.0');
});
