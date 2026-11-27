/**
 * WH-304 wording of Design offline-capture.md 7.11a (DQ10), word for word, on the screens built in A-1 to A-3:
 * "Accepted · Dispatch {{number}}" / "સ્વીકાર્યું · જાવક {{number}}" on the recorder's accepted row (the number keeps 0-9), and
 * the status line's count in Gujarati digits.
 *
 * Real: `UnsentRow`, i18n. The row is the shape `loadUnsentList` gives an accepted held item (heldRules.test.ts R4 checks that).
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { setLanguage, t } from '@/i18n';
import { UnsentRow } from '@/features/unsent/UnsentRow';
import type { UnsentListRow } from '@/features/unsent/unsentList';

const mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const accepted = (overrides: Partial<UnsentListRow> = {}): UnsentListRow => ({
  id: 'acc-1',
  state: 'sent',
  section: 'sent',
  title: 'New dispatch',
  customer: 'asha Traders',
  recordedAt: new Date('2026-11-27T08:30:00+05:30').getTime(),
  sentNumber: 'D-17',
  photoMissing: false,
  tag: 'accepted',
  form: null,
  reason: null,
  sentDoc: 'dispatch',
  heldId: 'acc-1',
  target: { dispatchId: 'd-17' },
  ...overrides,
});

const show = (row: UnsentListRow) => render(<UnsentRow row={row} divider={false} onOpen={jest.fn()} onDelete={jest.fn()} />);

afterEach(async () => {
  await setLanguage('en');
});

describe('7.11a (b): the accepted row names its document', () => {
  it('English: "Accepted · Dispatch D-17"', async () => {
    await show(accepted());
    expect(screen.getByTestId('unsent-row-tag-acc-1')).toHaveTextContent('Accepted · Dispatch D-17');
  });

  it('Gujarati: "સ્વીકાર્યું · જાવક D-17" with the number in 0-9', async () => {
    await setLanguage('gu');
    await show(accepted());
    expect(screen.getByTestId('unsent-row-tag-acc-1')).toHaveTextContent('સ્વીકાર્યું · જાવક D-17');
  });

  it('a GRN reads "Accepted · GRN B1"', async () => {
    await show(accepted({ sentDoc: 'grn', sentNumber: 'B1', target: { grnId: 'g-B1' } }));
    expect(screen.getByTestId('unsent-row-tag-acc-1')).toHaveTextContent('Accepted · GRN B1');
  });

  it('Gujarati GRN', async () => {
    await setLanguage('gu');
    await show(accepted({ sentDoc: 'grn', sentNumber: 'B1', target: { grnId: 'g-B1' } }));
    expect(screen.getByTestId('unsent-row-tag-acc-1')).toHaveTextContent('સ્વીકાર્યું · આવક પાવતી B1');
  });
});

describe('7.11a (b): heldLine counts in Gujarati digits', () => {
  it.each([
    [2, 'તમારી ૨ એન્ટ્રી રોકેલી છે. જોવા ટૅપ કરો.'],
    [12, 'તમારી ૧૨ એન્ટ્રી રોકેલી છે. જોવા ટૅપ કરો.'],
  ])('%i items', async (count, words) => {
    await setLanguage('gu');
    expect(t('components.offlineStatus.heldLine' as never, { count })).toBe(words);
  });
});
