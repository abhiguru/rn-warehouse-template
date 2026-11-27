/**
 * WH-304 wording of Design offline-capture.md 7.11a (DQ10), word for word (updated for WH-381 GRN-only scope):
 * "Accepted · GRN {{number}}" / "સ્વીકાર્યું · આવક પાવતી {{number}}" on the recorder's accepted row (the number keeps 0-9),
 * the status line's count in Gujarati digits, and the missing-photo footnote for GRNs.
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
  title: 'New GRN',
  customer: 'asha Traders',
  recordedAt: new Date('2026-11-27T08:30:00+05:30').getTime(),
  sentNumber: 'B1',
  photoMissing: false,
  tag: 'accepted',
  form: null,
  reason: null,
  sentDoc: 'grn',
  heldId: 'acc-1',
  target: { grnId: 'g-B1' },
  ...overrides,
});

const show = (row: UnsentListRow) => render(<UnsentRow row={row} divider={false} onOpen={jest.fn()} onDelete={jest.fn()} />);

afterEach(async () => {
  await setLanguage('en');
});

describe('7.11a (b): the accepted row names its document', () => {
  it('a GRN reads "Accepted · GRN B1"', async () => {
    await show(accepted());
    expect(screen.getByTestId('unsent-row-tag-acc-1')).toHaveTextContent('Accepted · GRN B1');
  });

  it('Gujarati GRN with the number in 0-9', async () => {
    await setLanguage('gu');
    await show(accepted());
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

describe('7.11c (b): the footnote of a photos item with a missing file names its document', () => {
  const missing = (overrides: Partial<UnsentListRow> = {}) =>
    accepted({ id: 'ph-1', tag: 'sent', sentDoc: undefined, sentNumber: null, title: 'Photos', photoMissing: true, heldId: undefined, ...overrides });
  const footnote = () => screen.getByTestId('unsent-row-photo-missing-ph-1');

  it('a GRN keeps its own sentence: "…; the GRN was sent without it."', async () => {
    await show(missing());
    expect(footnote()).toHaveTextContent('A photo file is missing on this phone; the GRN was sent without it.');
  });

  it('no footnote while no file is missing', async () => {
    await show(missing({ photoMissing: false }));
    expect(screen.queryByTestId('unsent-row-photo-missing-ph-1')).not.toBeOnTheScreen();
  });
});
