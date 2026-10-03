// Explicit admission for the audited, installed VM fixture candidate only.
import assert from 'node:assert/strict';
export const CURRENT_FIXTURE_SHA256 = '8649a9ea301248d5e314063cb7f567d641639fd2f8164df39b27ede993bce80b';
export const CURRENT_FIXTURE_BINDING = Object.freeze({
  mobileSource: '78fe59284cbd476bd7661d6ae5b0b8b189abb3c4',
  backendSource: '75a6fb1badeff39b727099d9d67f3c9e84a2cf12',
  versionCode: 2026100311,
  package: 'in.gurucold.warehouse.fixture',
  architecture: 'x86_64',
});
export function staffFixtureArtifact(c) {
  if (c.artifactSHA256 === CURRENT_FIXTURE_SHA256) {
    assert.deepEqual(c.candidateBinding, CURRENT_FIXTURE_BINDING, 'EXACT_INSTALLED_FIXTURE_BINDING_REQUIRED');
    assert.equal(c.origin, 'https://backend-core.example.test');
    assert.equal(c.instanceId, 'b0ec3933-5258-4bd5-87f4-d57b13a78971');
    return;
  }
  assert.equal(c.artifactSHA256, 'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
  assert.equal(Object.hasOwn(c, 'candidateBinding'), false, 'LEGACY_CASE_BINDING_UNCHANGED_REQUIRED');
}
