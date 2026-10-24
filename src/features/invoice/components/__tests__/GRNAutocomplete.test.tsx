import React from 'react';
import { KeyboardAvoidingView, Modal, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, type Mode } from '@/theme/tokens';
import { GRNAutocomplete } from '../GRNAutocomplete';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockGetInvoiceableGrns = jest.fn();
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getInvoiceableGrns: (...args: unknown[]) => mockGetInvoiceableGrns(...args),
}));

const MODES: Mode[] = ['light', 'dark'];

const grn = {
  id: 'g1',
  gr_no: '311',
  date: '2026-10-09',
  customer_id: 'c1',
  customer_name: 'Fictional Traders',
  sender_name: '',
  supervisor_name: '',
  total_dispatched_qty: 12,
  has_uninvoiced_items: true,
};

async function renderIn(brand: (typeof BRANDS)[number], mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GRNAutocomplete isVisible onClose={jest.fn()} onSelect={jest.fn()} currentValue={grn} />);
  });
  return tree;
}

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).filter(c => typeof c === 'string').join(''))
    .join('|');
}

describe('GRNAutocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetInvoiceableGrns.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('lists GRNs with the document number and date', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const tree = await renderIn(brand, mode);
      const text = allText(tree);
      expect(text).toContain('GRN 311');
      expect(text).toContain('Fictional Traders');
      expect(text).toContain('1 GRN');
    });
  });

  it('shows an error with a retry action when loading fails', async () => {
    mockGetInvoiceableGrns.mockResolvedValue({ success: false, data: [], message: 'boom' });
    const tree = await renderIn('orange', 'light');
    const text = allText(tree);
    expect(text).toContain("Couldn't load GRNs");
    expect(text).toContain('Try again');
    expect(text).not.toContain('boom');
  });

  describe('the search', () => {
    const search = (tree: ReactTestRenderer) => tree.root.findByType(TextInput);
    const type = async (tree: ReactTestRenderer, text: string) => {
      await act(async () => { search(tree).props.onChangeText(text); });
    };
    const settleDebounce = async () => {
      await act(async () => { jest.advanceTimersByTime(300); });
    };
    const pressClear = async (tree: ReactTestRenderer) => {
      const clear = tree.root.find((node) => node.props.accessibilityLabel === 'Clear search' && typeof node.props.onPress === 'function');
      await act(async () => { clear.props.onPress(); });
    };
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((done) => { resolve = done; });
      return { promise, resolve };
    };
    const other = { ...grn, id: 'g2', gr_no: '312', customer_name: 'Second Traders' };

    it('drops an answer that comes after a newer search was started', async () => {
      mockGetInvoiceableGrns.mockResolvedValueOnce({ success: true, data: [] });
      const tree = await renderIn('orange', 'light');
      const older = deferred<{ success: boolean; data: typeof grn[] }>();
      const newer = deferred<{ success: boolean; data: typeof grn[] }>();
      mockGetInvoiceableGrns.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

      await type(tree, '31');
      await settleDebounce();
      await type(tree, '312');
      await settleDebounce();
      expect(mockGetInvoiceableGrns.mock.calls.map(([query]) => query)).toEqual([undefined, '31', '312']);
      // The newer search answers first; the older one answers last and must not replace it.
      await act(async () => { newer.resolve({ success: true, data: [other] }); });
      await act(async () => { older.resolve({ success: true, data: [grn] }); });

      const text = allText(tree);
      expect(text).toContain('Second Traders');
      expect(text).not.toContain('Fictional Traders');
      await act(async () => { tree.unmount(); });
    });

    it('drops the answer of a search that was started before the query changed again', async () => {
      mockGetInvoiceableGrns.mockResolvedValueOnce({ success: true, data: [] });
      const tree = await renderIn('orange', 'light');
      const first = deferred<{ success: boolean; data: typeof grn[] }>();
      mockGetInvoiceableGrns.mockReturnValueOnce(first.promise);
      await type(tree, '31');
      await settleDebounce();

      // The person types on; the search for "31" is no longer wanted when it answers.
      await type(tree, '312');
      await act(async () => { first.resolve({ success: true, data: [grn] }); });

      expect(allText(tree)).not.toContain('Fictional Traders');
      await act(async () => { tree.unmount(); });
    });

    it('Clear cancels a search that was waiting for its pause, and shows the full list again', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const tree = await renderIn('orange', 'light');
      mockGetInvoiceableGrns.mockClear();
      await type(tree, 'xy');

      await pressClear(tree);
      await settleDebounce();

      // The search for "xy" never ran; the list was asked for once, without a query.
      expect(mockGetInvoiceableGrns.mock.calls.map(([query]) => query)).toEqual([undefined]);
      expect(search(tree).props.value).toBe('');
      await act(async () => { tree.unmount(); });
    });

    it('announces the number of GRNs found as a polite live region', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn, other] });
      const tree = await renderIn('orange', 'light');

      const region = tree.root.findByProps({ testID: 'grn-picker-count' });

      expect(region.props.accessibilityLiveRegion).toBe('polite');
      expect(allText(tree)).toContain('2 GRNs');
      // The region is there before there is anything to announce.
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [] });
      await act(async () => { tree.unmount(); });
      const empty = await renderIn('orange', 'light');
      expect(empty.root.findByProps({ testID: 'grn-picker-count' }).props.accessibilityLiveRegion).toBe('polite');
      expect(allText(empty).split('|').some((line) => /^\d+ GRNs?$/.test(line))).toBe(false);
      await act(async () => { empty.unmount(); });
    });
  });

  describe('the invoice\'s own GRN in an edit', () => {
    const pinned = { id: 'own', gr_no: '300', customer_name: 'Own Traders' };

    it('is listed first as the current GRN, with a check, and choosing it only closes the sheet', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const onClose = jest.fn();
      const onSelect = jest.fn();
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(<GRNAutocomplete isVisible onClose={onClose} onSelect={onSelect} currentValue={{ id: 'own' }} pinnedGrn={pinned} />);
      });

      const row = tree.root.findByProps({ testID: 'grn-picker-current' });
      expect(row.props.accessibilityState).toEqual({ selected: true });
      expect(row.props.accessibilityLabel).toContain('GRN 300');
      expect(allText(tree)).toContain('Current GRN');
      expect(allText(tree)).toContain('Own Traders');
      const checks = row.findAll((node) => node.props.name === 'check');
      expect(checks.length).toBeGreaterThan(0);

      await act(async () => { row.props.onPress(); });
      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      await act(async () => { tree.unmount(); });
    });

    it('after the invoice moved to another GRN it is listed as the saved GRN, without a check, and choosing it selects it', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const onClose = jest.fn();
      const onSelect = jest.fn();
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(<GRNAutocomplete isVisible onClose={onClose} onSelect={onSelect} currentValue={{ id: 'other' }} pinnedGrn={pinned} />);
      });

      const row = tree.root.findByProps({ testID: 'grn-picker-current' });
      expect(row.props.accessibilityState).toEqual({ selected: false });
      expect(allText(tree)).toContain('Saved with this invoice');
      expect(allText(tree)).not.toContain('Current GRN');
      expect(row.findAll((node) => node.props.name === 'check')).toHaveLength(0);

      await act(async () => { row.props.onPress(); });
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'own', gr_no: '300' }));
      expect(onClose).toHaveBeenCalled();
      await act(async () => { tree.unmount(); });
    });

    it('reports that its Modal has finished closing', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const onDismissed = jest.fn();
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(<GRNAutocomplete isVisible={false} onClose={jest.fn()} onSelect={jest.fn()} onDismissed={onDismissed} />);
      });

      tree.root.findByType(Modal).props.onDismiss();

      expect(onDismissed).toHaveBeenCalledTimes(1);
      await act(async () => { tree.unmount(); });
    });

    it('is not listed in a new invoice, which has no GRN of its own', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const tree = await renderIn('orange', 'light');

      expect(tree.root.findAllByProps({ testID: 'grn-picker-current' }, { deep: false })).toHaveLength(0);
      expect(allText(tree)).not.toContain('Current GRN');
      await act(async () => { tree.unmount(); });
    });

    it('is hidden while the typed search does not match it', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(<GRNAutocomplete isVisible onClose={jest.fn()} onSelect={jest.fn()} pinnedGrn={pinned} />);
      });
      expect(tree.root.findAllByProps({ testID: 'grn-picker-current' }, { deep: false })).toHaveLength(1);

      await act(async () => { tree.root.findByType(TextInput).props.onChangeText('311'); });

      expect(tree.root.findAllByProps({ testID: 'grn-picker-current' }, { deep: false })).toHaveLength(0);
      await act(async () => { tree.unmount(); });
    });
  });

  it('lifts the sheet over the keyboard and draws under the navigation bar', async () => {
    mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
    const tree = await renderIn('orange', 'light');

    const modal = tree.root.findByType(Modal);
    expect(modal.props.navigationBarTranslucent).toBe(true);
    expect(tree.root.findAllByType(KeyboardAvoidingView).length).toBeGreaterThan(0);
    expect(tree.root.findByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    await act(async () => { tree.unmount(); });
  });
});
