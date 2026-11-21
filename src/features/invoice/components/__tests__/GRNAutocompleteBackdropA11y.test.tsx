/**
 * WH-254: on the invoice "Search GRNs" sheet and the dispatch "Choose GRN" sheet the backdrop is not a screen-reader
 * stop (no role, no label, not accessible), a tap on it still closes the sheet, and the sheet's own ✕ is the one
 * "Close" button. The label key that only the backdrop used is gone from English and Gujarati.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { GRNAutocomplete } from '../GRNAutocomplete';
import { GRNAutocompleteBottomSheet } from '@/features/dispatch/components/GRNAutocompleteBottomSheet';
import { invoice as invoiceEn } from '@/i18n/locales/en/invoice';
import { invoice as invoiceGu } from '@/i18n/locales/gu/invoice';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getInvoiceableGrns: jest.fn(async () => ({ success: true, data: [] })),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({
  searchGRNNumbers: jest.fn(async () => []),
  getGRNPrefixesWithStock: jest.fn(async () => []),
  getCustomerGRNsWithStock: jest.fn(async () => []),
}));

const onClose = jest.fn();

const sheets: [string, () => React.ReactElement][] = [
  ['invoice Search GRNs', () => <GRNAutocomplete isVisible onClose={onClose} onSelect={jest.fn()} currentValue={null} />],
  ['dispatch Choose GRN', () => <GRNAutocompleteBottomSheet isVisible onClose={onClose} onSelect={jest.fn()} />],
];

describe.each(sheets)('%s sheet', (_name, element) => {
  beforeEach(async () => {
    jest.useFakeTimers();
    onClose.mockClear();
    await render(element());
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  // The backdrop is hidden from the screen reader on purpose, so no role, label or text query can reach it: it is found
  // by the two props that say so, on the host view that answers a press.
  const backdrops = () =>
    screen.root!.queryAll((n) => typeof n.type === 'string' && typeof n.props.onClick === 'function' && n.props.importantForAccessibility === 'no');

  it('has a backdrop that is no screen-reader stop: no role, no label, not accessible', () => {
    const found = backdrops();
    expect(found.length).toBeGreaterThan(0);
    for (const n of found) {
      expect(n.props.accessible).toBe(false);
      expect(n.props.accessibilityRole).toBeUndefined();
      expect(n.props.accessibilityLabel).toBeUndefined();
    }
  });

  it('closes on a tap on the backdrop, as before', async () => {
    await user().press(backdrops()[0]);
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    expect(onClose).toHaveBeenCalled();
  });

  it('has exactly one "Close" button, the ✕, and it closes the sheet', async () => {
    const closes = screen.getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(1);
    expect(closes[0]).not.toHaveProp('importantForAccessibility', 'no');
    await user().press(closes[0]);
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    expect(onClose).toHaveBeenCalled();
  });

  it('has no element labelled "Close GRN list" (or its Gujarati)', () => {
    expect(screen.queryByLabelText('Close GRN list', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('આવક પાવતીની યાદી બંધ કરો', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });
});

describe('the removed label key', () => {
  it('is gone from the English and Gujarati invoice texts', () => {
    expect(Object.keys(invoiceEn.grnPicker)).not.toContain('closeListA11y');
    expect(Object.keys(invoiceGu.grnPicker ?? {})).not.toContain('closeListA11y');
  });
});
