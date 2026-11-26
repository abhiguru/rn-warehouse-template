/**
 * WH-301 (contract section 9, section 1 DQ2, section 2.1b PQ5): the status bar's line 2 for an unreadable unsent file and for
 * items waiting for an administrator. `deriveStatusBar` is pure. Not tested here (screen): "not pressable, no chevron".
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED) =====
 *  - The line-2 keys are `unsentUnreadable` and `waitingForAdmin` (section 9) and carry `count`; the unreadable line has `count`
 *    0 and the bar is critical (DQ2 "critical style"); the waitingForAdmin line is neutral (Design 4.9).
 * =============================================
 */
import { deriveStatusBar, type StatusBarInput } from '@/features/phone-copy/statusBarState';

const unsent = { count: 0, sendBy: 0, limitReached: false, unreadable: false, waitingForAdmin: 0 };
const base = {
  phase: 'ready', loading: false, offline: true, current: false, lastRunFailed: false,
  asOf: Date.parse('2026-11-25T05:12:00Z'), storageLow: false, unsent: null, running: false,
} as StatusBarInput;
const view = (patch: Record<string, unknown>) => deriveStatusBar({ ...base, unsent: { ...unsent, ...patch } as never });

describe('line 2 for unsent work that cannot be read or sent', () => {
  it('an unreadable file: line 2 says so, with no count, in the critical style', () => {
    const v = view({ unreadable: true, limitReached: true });
    expect(v.line2).toMatchObject({ key: 'unsentUnreadable' });
    expect(v.tone).toBe('critical');
  });

  it('items waiting for an administrator: line 2 says so with the count, neutral, and no "limit" row', () => {
    const v = view({ waitingForAdmin: 2 });
    expect(v.line2).toEqual({ key: 'waitingForAdmin', count: 2 });
    expect(v.tone).toBe('neutral');
    expect(v.limit).toBe(false);
  });

  it('with nothing wrong there is no such line', () => {
    expect(view({}).line2).toBeNull();
  });
});
