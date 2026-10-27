import { AppTooOldError, getAppTooOld, reportAppTooOld } from '../appTooOld';
import { isUpgrading, noteDiscoveryUpgrading, resetUpgradeNotice } from '../upgradeNotice';
import { advanceSessionGeneration } from '../sessionLifecycle';
import { runSessionScopedClears } from '../sessionScopedRegistry';

const context = { dispatch: jest.fn() };

describe('the facility notices end with the session', () => {
  afterEach(() => resetUpgradeNotice());

  it('lowers the "being updated" notice on a session change', () => {
    noteDiscoveryUpgrading();
    expect(isUpgrading()).toBe(true);
    advanceSessionGeneration();
    expect(isUpgrading()).toBe(false);
  });

  it('lowers the "being updated" notice at session teardown', async () => {
    noteDiscoveryUpgrading();
    await runSessionScopedClears(context);
    expect(isUpgrading()).toBe(false);
  });

  it('lifts the "Update the app" screen at session teardown', async () => {
    reportAppTooOld(new AppTooOldError('old', '2.0.0', '1.0.0'));
    expect(getAppTooOld()).not.toBeNull();
    await runSessionScopedClears(context);
    expect(getAppTooOld()).toBeNull();
  });

  it('keeps the "Update the app" screen across a plain session change (a token refresh)', () => {
    reportAppTooOld(new AppTooOldError('old', '2.0.0', '1.0.0'));
    advanceSessionGeneration();
    expect(getAppTooOld()).not.toBeNull();
  });
});
