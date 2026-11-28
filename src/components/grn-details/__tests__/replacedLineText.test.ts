/**
 * WH-303 slice A-4, test first (product/tech/app-offline-edit-grn.md section 7 and cases N5, N6; Design offline-capture.md
 * 6.2 and 6.x: `replaced.field`, `replaced.fieldLate`, `replaced.lineAdded`, `replaced.lineAddedLate`, `replaced.whoUnknown`,
 * `replaced.empty`). The helper does not exist yet: these fail until it is built.
 *
 * Real: the helper, the translations and the time formatting. Nothing is faked; the clock is fixed to 27 Nov 2026, 5 pm IST.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent; ASSUMED) =====
 *  - The helper is `replacedLineText(entry, t)` in `@/components/grn-details/replacedLineText` (the contract names the
 *    function, not the file). `t` is the app's `t`.
 *  - `entry` is a row of `get_grn_replacements` (section 5.4): { id, kind: 'field' | 'line_added', field, newer_value,
 *    newer_by_name, newer_at, sent_value, sent_by_name, sent_at, recorded_at }; a field's `field` is the column name
 *    ('rack'), its values are strings or null; a `line_added` entry's `sent_value` is { item_name, qty, packaging }.
 *  - A quantity is written with the packaging word ("4 Bag"), the contract says only "with the packaging word".
 * ====================================================================
 */
import { setLanguage, t } from '@/i18n';

type Entry = Record<string, unknown>;
const text = (entry: Entry): string => (require('@/components/grn-details/replacedLineText') as { replacedLineText(e: Entry, t: unknown): string }).replacedLineText(entry, t);

// Today is 27 Nov 2026; times are IST. 4:20 pm IST = 10:50 UTC.
const at = (hhmm: string, day = '2026-11-27') => `${day}T${hhmm}:00+05:30`;
const field = (over: Entry = {}): Entry => ({
  id: 'r1', kind: 'field', field: 'rack', newer_value: 'D-5', newer_by_name: 'Meena Fictional', newer_at: at('16:15'),
  sent_value: 'C-2', sent_by_name: 'Ravi Fictional', sent_at: at('16:20'), recorded_at: null, ...over,
});
const added = (over: Entry = {}): Entry => ({
  id: 'r2', kind: 'line_added', field: null, newer_value: null, newer_by_name: null, newer_at: null,
  sent_value: { item_name: 'Rice', qty: 4, packaging: 'Bag' }, sent_by_name: 'Ravi Fictional', sent_at: at('16:20'), recorded_at: null, ...over,
});

beforeEach(() => { jest.useFakeTimers({ now: new Date(at('17:00')) }); });
afterEach(() => { jest.useRealTimers(); setLanguage('en'); });

describe('N5: which sentence a line uses', () => {
  it('no phone time: the plain sentence with the time it reached the server', () => {
    expect(text(field())).toBe('Rack: D-5 (Meena Fictional, 4:15 pm) was replaced by C-2 (Ravi Fictional, 4:20 pm).');
  });

  it('a phone time within a minute of the server time: the plain sentence, one time', () => {
    expect(text(field({ recorded_at: '2026-11-27T16:19:30+05:30' }))).toBe('Rack: D-5 (Meena Fictional, 4:15 pm) was replaced by C-2 (Ravi Fictional, 4:20 pm).');
    expect(text(field({ recorded_at: '2026-11-27T16:19:20+05:30', sent_at: '2026-11-27T16:20:20+05:30' }))).toBe('Rack: D-5 (Meena Fictional, 4:15 pm) was replaced by C-2 (Ravi Fictional, 4:20 pm).');
  });

  it('61 seconds or more apart, before or after: the sentence with made and reached the server', () => {
    const late = 'Rack: D-5 (Meena Fictional, 4:15 pm) was replaced by C-2 (Ravi Fictional, made 2:05 pm, reached the server 4:20 pm).';
    expect(text(field({ recorded_at: at('14:05') }))).toBe(late);
    const justOver = text(field({ recorded_at: '2026-11-27T16:18:59+05:30', sent_at: '2026-11-27T16:20:00+05:30' }));
    expect(justOver).toContain('made 4:18 pm, reached the server 4:20 pm');
    const ahead = text(field({ recorded_at: '2026-11-27T16:21:30+05:30', sent_at: '2026-11-27T16:20:00+05:30' }));
    expect(ahead).toContain('reached the server');
  });

  it('a line added: plain, and late with both times', () => {
    expect(text(added())).toMatch(/^Line added: Rice, 4.*Bag \(Ravi Fictional, 4:20 pm\)\.$/);
    expect(text(added({ recorded_at: at('14:05') }))).toMatch(/^Line added: Rice, 4.*Bag \(Ravi Fictional, made 2:05 pm, reached the server 4:20 pm\)\.$/);
  });

  it('a time on an earlier day shows its date', () => {
    expect(text(field({ newer_at: at('16:12', '2026-11-26') }))).toMatch(/^Rack: D-5 \(Meena Fictional, 26\/11\/26, 4:12 pm\) was replaced by C-2/);
  });
});

describe('N6: who is not known, and an empty value', () => {
  it('a missing person is "someone" and an empty value is "empty"', () => {
    expect(text(field({ newer_value: null, newer_by_name: null, newer_at: at('16:12') }))).toBe('Rack: empty (someone, 4:12 pm) was replaced by C-2 (Ravi Fictional, 4:20 pm).');
    expect(text(field({ sent_value: '', sent_by_name: null }))).toBe('Rack: D-5 (Meena Fictional, 4:15 pm) was replaced by empty (someone, 4:20 pm).');
  });

  it('a line added by someone not known says someone', () => {
    expect(text(added({ sent_by_name: null }))).toContain('(someone, 4:20 pm)');
  });
});

describe('Gujarati', () => {
  it('uses the Gujarati sentences, Gujarati digits and the Gujarati words for someone and empty', () => {
    setLanguage('gu');
    const late = text(field({ newer_value: null, newer_by_name: null, recorded_at: at('14:05') }));
    expect(late).toContain('ખાલી');
    expect(late).toContain('કોઈ');
    expect(late).toContain('ની જગ્યાએ');
    expect(late).toContain('એ સર્વર પર પહોંચ્યું');
    expect(late).toContain('૪:૨૦');
    expect(late).toContain('૨:૦૫');
    // Times are in Gujarati digits; a typed value such as a rack ("C-2") keeps its own digits.
    expect(late).not.toMatch(/[0-9]{1,2}:[0-9]{2}/);
  });

  it('a Gujarati line added, late, ends with the reached-the-server words', () => {
    setLanguage('gu');
    const line = text(added({ recorded_at: at('14:05') }));
    expect(line).toContain('આઇટમ ઉમેરી: Rice');
    expect(line).toContain('એ સર્વર પર પહોંચી)');
  });
});
