// Bounded stages may use an explicitly authorized extension without editing history.
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
export function verifyCampaignDeadline(c, read, digest, now = Date.now()) {
  const original = read(c.campaignFile);
  if (!Object.hasOwn(c, 'extensionPlan')) {
    assert.equal(Object.hasOwn(c, 'extensionPlanSHA256'), false);
    assert.equal(original.deadline, c.campaignDeadlineUTC);
    return;
  }
  assert.ok(isAbsolute(c.extensionPlan));
  assert.match(c.extensionPlanSHA256, /^[a-f0-9]{64}$/);
  assert.equal(digest(c.extensionPlan), c.extensionPlanSHA256);
  const extension = read(c.extensionPlan);
  assert.equal(extension.scope, 'authorized-vm-campaign-extension');
  assert.equal(extension.supersedesDeadline, original.deadline);
  assert.equal(Date.parse(original.deadline)-Date.parse(original.startedAt), 172800000);
  for (const stamp of [extension.startedAt, extension.deadline]) assert.match(stamp, /(?:Z|[+-]\d{2}:\d{2})$/);
  const start = Date.parse(extension.startedAt), end = Date.parse(extension.deadline);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && start >= Date.parse(original.deadline));
  assert.ok(end > start && end-start <= 86400000 && start <= now && now < end);
  assert.equal(c.campaignDeadlineUTC, extension.deadline);
  assert.ok(isAbsolute(extension.authorization));
  assert.match(extension.authorizationSHA256, /^[a-f0-9]{64}$/);
  assert.equal(digest(extension.authorization), extension.authorizationSHA256);
  assert.equal(read(extension.authorization).oldDeadlineSuperseded, true);
}
