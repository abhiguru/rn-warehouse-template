/**
 * WH-298 (spec A5; Design Part 1, 1.5 and the answer to P9; contract section 8.2; T42, T43): which state the status bar
 * is in. `deriveStatusBar` is a pure function, so every row of Design's table and the edges between rows are tested here.
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives; the open points are marked) =====
 *  - `@/features/phone-copy/statusBarState`: `deriveStatusBar(input: StatusBarInput): StatusBarView` as contract 8.2.
 *  - line-1 keys (under `components.offlineStatus.`): upToDate, updating, offline, updateFailed, firstLoad, olderLoading,
 *    notReady, storageLow, and `olderPaused` (Design's answer to P9: row 6 while offline says
 *    "Older records will load when you reconnect." instead of "…are still loading.").
 *  - line-2 keys: unsent, sending, unsentLimit.
 *  - `view.row` for the storage and limit cases is not asserted (the flags `storage` and `limit` are).
 * ==========================================================================================
 */
import { deriveStatusBar, type StatusBarInput } from '@/features/phone-copy/statusBarState';

const AS_OF = Date.parse('2026-11-25T05:12:00Z');
const SEND_BY = Date.parse('2026-11-25T07:10:00Z');
const base: StatusBarInput = {
  phase: 'ready', loading: false, offline: false, current: true, lastRunFailed: false,
  asOf: AS_OF, storageLow: false, unsent: null, running: false,
};
const view = (patch: Partial<StatusBarInput> = {}) => deriveStatusBar({ ...base, ...patch });
const line1 = (patch: Partial<StatusBarInput> = {}) => view(patch).line1.map(l => l.key);

describe('deriveStatusBar: the rows of Design 1.5', () => {
  it('row 1: current is "Up to date", neutral, no action', () => {
    const v = view();
    expect(v).toMatchObject({ row: 1, tone: 'neutral', icon: 'check-circle-outline', action: null, line2: null, limit: false, storage: false });
    expect((v as { olderLoading?: boolean }).olderLoading).toBeFalsy();
    expect(line1()).toEqual(['upToDate']);
  });

  it('row 2: reachable, not current, no failure: "Updating…" with the server\'s time', () => {
    const v = view({ current: false, running: true });
    expect(v).toMatchObject({ row: 2, tone: 'neutral', icon: 'sync', action: null });
    expect(v.line1).toEqual([{ key: 'updating', time: AS_OF }]);
  });

  it('row 3: offline is "Offline. Last updated <time>", neutral, no action', () => {
    const v = view({ offline: true, current: false });
    expect(v).toMatchObject({ row: 3, tone: 'neutral', icon: 'cloud-off-outline', action: null });
    expect(v.line1).toEqual([{ key: 'offline', time: AS_OF }]);
  });

  it('row 3 wins over "current": a copy is never current while offline', () => {
    expect(view({ offline: true, current: true }).row).toBe(3);
  });

  it('row 4: the last run failed while reachable: "Couldn\'t update" with Try again', () => {
    const v = view({ current: false, lastRunFailed: true });
    expect(v).toMatchObject({ row: 4, tone: 'neutral', icon: 'cloud-refresh-outline', action: 'retry', actionDisabled: false });
    expect(v.line1).toEqual([{ key: 'updateFailed', time: AS_OF }]);
  });

  it('row 4 is not shown while the copy is current (a failed run followed by a success)', () => {
    expect(view({ lastRunFailed: true, current: true }).row).toBe(1);
  });

  it('row 5: first load, stage one, reachable and loading', () => {
    const v = view({ phase: 'stage1', loading: true, current: false, running: true, asOf: null });
    expect(v).toMatchObject({ row: 5, tone: 'neutral', icon: 'cloud-download-outline', action: null });
    expect(v.line1).toEqual([{ key: 'firstLoad' }]);
  });

  it('row 5 also covers an empty phone whose load has just started', () => {
    expect(view({ phase: 'empty', loading: true, current: false, asOf: null }).row).toBe(5);
  });

  it('row 7: nothing loaded yet and not loading (offline or failed): "not ready", with Try again', () => {
    for (const patch of [{ offline: true }, { lastRunFailed: true }, {}] as Partial<StatusBarInput>[]) {
      const v = view({ phase: 'empty', loading: false, current: false, asOf: null, ...patch });
      expect(v).toMatchObject({ row: 7, tone: 'neutral', icon: 'cloud-off-outline', action: 'retry' });
      expect(v.line1).toEqual([{ key: 'notReady' }]);
    }
  });

  it('row 7 for stage one that is not loading (a first load that was cut and is waiting)', () => {
    expect(view({ phase: 'stage1', loading: false, current: false, offline: true, asOf: AS_OF }).row).toBe(7);
  });
});

describe('deriveStatusBar: WH-381 removes row 6 (olderLoading / olderPaused)', () => {
  it('never returns olderLoading or olderPaused online, offline, or on a failed run', () => {
    const cases: Partial<StatusBarInput>[] = [
      { phase: 'ready', current: false, running: true },
      { phase: 'ready', offline: true, current: false },
      { phase: 'ready', lastRunFailed: true, current: false },
      { phase: 'stage2' as StatusBarInput['phase'], current: false, running: true },
      { phase: 'stage2' as StatusBarInput['phase'], offline: true, current: false },
      { phase: 'stage2' as StatusBarInput['phase'], lastRunFailed: true, current: false },
    ];
    for (const patch of cases) {
      const v = view(patch);
      expect((v as { olderLoading?: boolean }).olderLoading).toBeFalsy();
      expect(v.line1.map(l => l.key)).not.toContain('olderLoading');
      expect(v.line1.map(l => l.key)).not.toContain('olderPaused');
    }
  });
});

describe('deriveStatusBar: "current" and the routine sync (T43)', () => {
  it('a routine sync that keeps the copy current stays on row 1 with the same icon and words', () => {
    const idle = view({ running: false });
    const syncing = view({ running: true });
    expect(syncing).toMatchObject({ row: 1, icon: 'check-circle-outline' });
    expect(syncing.line1).toEqual(idle.line1);
  });

  it('only when the copy is past the minute (current false) does a running sync show "Updating…"', () => {
    expect(view({ current: false, running: true }).row).toBe(2);
  });
});

describe('deriveStatusBar: the action', () => {
  it('Try again is disabled while a run is going, so a second tap starts nothing', () => {
    expect(view({ phase: 'empty', current: false, asOf: null, running: true, loading: false }).actionDisabled).toBe(true);
    expect(view({ current: false, lastRunFailed: true, running: true }).actionDisabled).toBe(true);
  });

  it('is offered only in rows 4 and 7', () => {
    const withAction = [
      view({ current: false, lastRunFailed: true }), view({ phase: 'empty', current: false, asOf: null }),
    ];
    const without = [view(), view({ current: false }), view({ offline: true, current: false }),
      view({ phase: 'stage1', loading: true, current: false, asOf: null })];
    for (const v of withAction) expect(v.action).toBe('retry');
    for (const v of without) expect(v.action).toBeNull();
  });
});

describe('deriveStatusBar: the two critical states and line 2', () => {
  it('storage running short replaces line 1, is critical, has the disk icon and drops the action of the row underneath', () => {
    const v = view({ storageLow: true, current: false, lastRunFailed: true });
    expect(v).toMatchObject({ storage: true, tone: 'critical', icon: 'harddisk', action: null });
    expect(v.line1).toEqual([{ key: 'storageLow' }]);
  });

  it('the 2-hour limit gives line 2 "unsentLimit", the clock icon and the critical style; line 1 stays that of rows 1 to 4', () => {
    const v = view({ offline: true, current: false, unsent: { count: 2, sendBy: SEND_BY, limitReached: true } });
    expect(v).toMatchObject({ limit: true, tone: 'critical', icon: 'clock-alert-outline' });
    expect(v.line1.map(l => l.key)).toEqual(['offline']);
    expect(v.line2).toMatchObject({ key: 'unsentLimit', count: 2 });
  });

  it('when both apply the clock icon wins over the disk icon, and storage text is on line 1', () => {
    const v = view({ storageLow: true, unsent: { count: 1, sendBy: SEND_BY, limitReached: true } });
    expect(v).toMatchObject({ tone: 'critical', icon: 'clock-alert-outline', limit: true, storage: true });
    expect(v.line1.map(l => l.key)).toEqual(['storageLow']);
  });

  it('unsent items with no connection: line 2 says how many and the time to send them by', () => {
    const v = view({ offline: true, current: false, unsent: { count: 3, sendBy: SEND_BY, limitReached: false } });
    expect(v.line2).toEqual({ key: 'unsent', count: 3, time: SEND_BY });
    expect(v.tone).toBe('neutral');
  });

  it('unsent items while the server is reachable: "sending"', () => {
    const v = view({ unsent: { count: 1, sendBy: SEND_BY, limitReached: false } });
    expect(v.line2).toMatchObject({ key: 'sending', count: 1 });
  });

  it('an empty unsent summary has no line 2, and WH-298\'s null has none either', () => {
    expect(view({ unsent: { count: 0, sendBy: SEND_BY, limitReached: false } }).line2).toBeNull();
    expect(view({ unsent: null }).line2).toBeNull();
  });

  it('every state that is not the limit or low storage is neutral (offline is not an error)', () => {
    const patches: Partial<StatusBarInput>[] = [
      {}, { current: false, running: true }, { offline: true, current: false }, { current: false, lastRunFailed: true },
      { phase: 'stage1', loading: true, current: false }, { phase: 'ready', current: false },
      { phase: 'empty', current: false, offline: true },
      { offline: true, unsent: { count: 9, sendBy: SEND_BY, limitReached: false } },
    ];
    for (const patch of patches) expect(view(patch).tone).toBe('neutral');
  });
});
