/**
 * WH-391 (card product/board/WH-391): the facility's numbering rule is kept in memory (`numberingCache`) so a form's number box
 * can be decided without a read. It belongs to one facility: after a facility switch (the session generation advances) or a
 * teardown it is back to "not known yet" (`serverIssues` null, the number box follows the WH-161 rule for that), and a read of
 * the copy that gives no row clears an earlier value instead of keeping it.
 *
 * Real: the cache, the session registry and the generation counter. Faked at the edge: the copy's `numbering` setting (what the
 * facility's own phone copy holds), and the sync run end.
 */
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { runSessionScopedClears } from '@/config/sessionScopedRegistry';
import { refreshNumbering, serverIssues } from '@/features/unsent/numberingCache';

let mockSetting: unknown = null;
let mockSettingFails = false;
jest.mock('@/features/phone-copy/copyQueries', () => ({
  readSetting: async () => {
    if (mockSettingFails) throw new Error('The copy cannot be read now');
    return mockSetting;
  },
}));
jest.mock('@/features/phone-copy/syncEngine', () => ({ subscribeSyncRunEnd: () => () => undefined }));

const facilityA = { grn: { scheme: 'server', server_issues: true }, dispatch: { scheme: 'server', server_issues: true } };
const facilityB = { grn: { scheme: 'typed', server_issues: false }, dispatch: { scheme: 'typed', server_issues: false } };

beforeEach(async () => {
  mockSettingFails = false;
  mockSetting = null;
  await runSessionScopedClears({ dispatch: () => undefined });
});

describe('the numbering rule of one facility never decides another\'s', () => {
  it('control: a row read from the copy is the rule', async () => {
    mockSetting = facilityA;
    await refreshNumbering();
    expect([serverIssues('grn'), serverIssues('dispatch')]).toEqual([true, true]);
  });

  it('after a facility switch the rule is "not known yet" until the new facility\'s row is read, then it is that facility\'s', async () => {
    mockSetting = facilityA;
    await refreshNumbering();
    expect(serverIssues('grn')).toBe(true);

    advanceSessionGeneration(); // the switch: the registry clears at once, with no teardown
    expect(serverIssues('grn')).toBeNull();
    expect(serverIssues('dispatch')).toBeNull();

    mockSetting = facilityB;
    await refreshNumbering();
    expect(serverIssues('grn')).toBe(false);
  });

  it('a teardown of the session (sign-out) also forgets it', async () => {
    mockSetting = facilityA;
    await refreshNumbering();
    await runSessionScopedClears({ dispatch: () => undefined });
    expect(serverIssues('grn')).toBeNull();
  });

  it('a read that gives no row clears the earlier value, as the next facility\'s copy has none yet', async () => {
    mockSetting = facilityA;
    await refreshNumbering();
    mockSetting = null;
    await refreshNumbering();
    expect(serverIssues('grn')).toBeNull();
  });

  it('a copy that cannot be read now keeps what was known (nothing is learned from a failure)', async () => {
    mockSetting = facilityA;
    await refreshNumbering();
    mockSettingFails = true;
    await refreshNumbering();
    expect(serverIssues('grn')).toBe(true);
  });
});
