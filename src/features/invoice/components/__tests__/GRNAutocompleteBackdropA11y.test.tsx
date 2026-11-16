/**
 * WH-254: on the invoice "Search GRNs" sheet and the dispatch "Choose GRN" sheet the backdrop is not a screen-reader
 * stop (no role, no label, not accessible), a tap on it still closes the sheet, and the sheet's own ✕ is the one
 * "Close" button. The label key that only the backdrop used is gone from English and Gujarati.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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
  let tree: ReactTestRenderer;
  beforeEach(async () => {
    jest.useFakeTimers();
    onClose.mockClear();
    await act(async () => { tree = create(element()); });
  });
  afterEach(async () => {
    await act(async () => { tree.unmount(); });
    jest.useRealTimers();
  });

  const backdrops = () => tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.importantForAccessibility === 'no');

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
    await act(async () => { backdrops()[0].props.onPress(); await jest.advanceTimersByTimeAsync(500); });
    expect(onClose).toHaveBeenCalled();
  });

  it('has exactly one "Close" button, the ✕, and it closes the sheet', async () => {
    const closes = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Close');
    expect(closes).toHaveLength(1);
    expect(closes[0].props.accessibilityRole).toBe('button');
    expect(closes[0].props.importantForAccessibility).not.toBe('no');
    await act(async () => { closes[0].props.onPress(); await jest.advanceTimersByTimeAsync(500); });
    expect(onClose).toHaveBeenCalled();
  });

  it('has no element labelled "Close GRN list" (or its Gujarati)', () => {
    const labels = tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);
    expect(labels).not.toContain('Close GRN list');
    expect(labels).not.toContain('આવક પાવતીની યાદી બંધ કરો');
  });
});

describe('the removed label key', () => {
  it('is gone from the English and Gujarati invoice texts', () => {
    expect(Object.keys(invoiceEn.grnPicker)).not.toContain('closeListA11y');
    expect(Object.keys(invoiceGu.grnPicker)).not.toContain('closeListA11y');
  });
});
