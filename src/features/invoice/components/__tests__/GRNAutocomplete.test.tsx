import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, type Mode } from '@/theme/tokens';
import { t } from '@/i18n';
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
// React Native's own Modal draws nothing while hidden, so its `onDismiss` cannot be reached; this stand-in keeps a host
// node with the Modal's props whether it is shown or not, and draws its children only when shown.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }: { visible?: boolean; children?: React.ReactNode }) =>
      ReactMock.createElement(View, { testID: 'modal', ...props }, props.visible ? children : null),
  };
});
// The real component drops `behavior` before the native view; this stand-in shows it to the test.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: (props: object) => <View testID="keyboard-avoiding" {...props} /> };
});

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
  await render(<GRNAutocomplete isVisible onClose={jest.fn()} onSelect={jest.fn()} currentValue={grn} />);
}

const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
const searchBox = () => screen.getByLabelText(t('invoice.grnPicker.searchPlaceholder'));

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
      await renderIn(brand, mode);
      expect(screen.getByText('GRN 311')).toBeOnTheScreen();
      expect(screen.getByText('Fictional Traders')).toBeOnTheScreen();
      expect(screen.getByText('1 GRN')).toBeOnTheScreen();
    });
  });

  it('shows an error with a retry action when loading fails', async () => {
    mockGetInvoiceableGrns.mockResolvedValue({ success: false, data: [], message: 'boom' });
    await renderIn('orange', 'light');
    expect(screen.getByText("Couldn't load GRNs")).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
    expect(screen.queryByText('boom')).not.toBeOnTheScreen();
  });

  describe('the search', () => {
    const type = async (text: string) => {
      await user().type(searchBox(), text);
    };
    const settleDebounce = async () => {
      await act(async () => { jest.advanceTimersByTime(300); });
    };
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((done) => { resolve = done; });
      return { promise, resolve };
    };
    const other = { ...grn, id: 'g2', gr_no: '312', customer_name: 'Second Traders' };

    it('drops an answer that comes after a newer search was started', async () => {
      mockGetInvoiceableGrns.mockResolvedValueOnce({ success: true, data: [] });
      await renderIn('orange', 'light');
      const older = deferred<{ success: boolean; data: typeof grn[] }>();
      const newer = deferred<{ success: boolean; data: typeof grn[] }>();
      mockGetInvoiceableGrns.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

      await type('31');
      await settleDebounce();
      await type('2');
      await settleDebounce();
      expect(mockGetInvoiceableGrns.mock.calls.map(([query]) => query)).toEqual([undefined, '31', '312']);
      // The newer search answers first; the older one answers last and must not replace it.
      await act(async () => { newer.resolve({ success: true, data: [other] }); });
      await act(async () => { older.resolve({ success: true, data: [grn] }); });

      expect(screen.getByText('Second Traders')).toBeOnTheScreen();
      expect(screen.queryByText('Fictional Traders')).not.toBeOnTheScreen();
    });

    it('drops the answer of a search that was started before the query changed again', async () => {
      mockGetInvoiceableGrns.mockResolvedValueOnce({ success: true, data: [] });
      await renderIn('orange', 'light');
      const first = deferred<{ success: boolean; data: typeof grn[] }>();
      mockGetInvoiceableGrns.mockReturnValueOnce(first.promise);
      await type('31');
      await settleDebounce();

      // The person types on; the search for "31" is no longer wanted when it answers.
      await type('2');
      await act(async () => { first.resolve({ success: true, data: [grn] }); });

      expect(screen.queryByText('Fictional Traders')).not.toBeOnTheScreen();
    });

    it('Clear cancels a search that was waiting for its pause, and shows the full list again', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      await renderIn('orange', 'light');
      mockGetInvoiceableGrns.mockClear();
      await type('xy');

      await user().press(screen.getByRole('button', { name: 'Clear search' }));
      await settleDebounce();

      // The search for "xy" never ran; the list was asked for once, without a query.
      expect(mockGetInvoiceableGrns.mock.calls.map(([query]) => query)).toEqual([undefined]);
      expect(searchBox()).toHaveDisplayValue('');
    });

    it('announces the number of GRNs found as a polite live region', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn, other] });
      await renderIn('orange', 'light');

      // The region is a plain View with no role or text of its own, so only its testID reaches it.
      expect(screen.getByTestId('grn-picker-count')).toHaveProp('accessibilityLiveRegion', 'polite');
      expect(screen.getByText('2 GRNs')).toBeOnTheScreen();

      // The region is there before there is anything to announce.
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [] });
      // A new key draws the sheet afresh, so it asks for the list again.
      await screen.rerender(<GRNAutocomplete key="again" isVisible onClose={jest.fn()} onSelect={jest.fn()} currentValue={grn} />);
      expect(screen.getByTestId('grn-picker-count')).toHaveProp('accessibilityLiveRegion', 'polite');
      expect(screen.queryByText(/^\d+ GRNs?$/)).not.toBeOnTheScreen();
    });
  });

  describe('the invoice\'s own GRN in an edit', () => {
    const pinned = { id: 'own', gr_no: '300', customer_name: 'Own Traders' };
    const currentRow = () => screen.getByTestId('grn-picker-current');
    const checksIn = (row: ReturnType<typeof screen.getByTestId>) => row.queryAll((node) => node.props.name === 'check');

    it('is listed first as the current GRN, with a check, and choosing it only closes the sheet', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const onClose = jest.fn();
      const onSelect = jest.fn();
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      await render(<GRNAutocomplete isVisible onClose={onClose} onSelect={onSelect} currentValue={{ id: 'own' }} pinnedGrn={pinned} />);

      const row = screen.getByRole('button', { name: /GRN 300. The current GRN of this invoice/ });
      expect(row).toBe(currentRow());
      // Exactly `selected: true`, nothing else in the state.
      expect(row.props.accessibilityState).toEqual({ selected: true });
      expect(row).toHaveAccessibleName(/GRN 300/);
      expect(screen.getByText('Current GRN')).toBeOnTheScreen();
      expect(screen.getByText('Own Traders')).toBeOnTheScreen();
      // The check is an icon with no text or role, so it is found by its name on the row's host views.
      expect(checksIn(row).length).toBeGreaterThan(0);

      await user().press(row);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('after the invoice moved to another GRN it is listed as the saved GRN, without a check, and choosing it selects it', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const onClose = jest.fn();
      const onSelect = jest.fn();
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      await render(<GRNAutocomplete isVisible onClose={onClose} onSelect={onSelect} currentValue={{ id: 'other' }} pinnedGrn={pinned} />);

      const row = screen.getByRole('button', { name: /GRN 300. The GRN this invoice was saved with/ });
      expect(row).toBe(currentRow());
      expect(row.props.accessibilityState).toEqual({ selected: false });
      expect(screen.getByText('Saved with this invoice')).toBeOnTheScreen();
      expect(screen.queryByText('Current GRN')).not.toBeOnTheScreen();
      expect(checksIn(row)).toHaveLength(0);

      await user().press(row);
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'own', gr_no: '300' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('reports that its Modal has finished closing', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const onDismissed = jest.fn();
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      await render(<GRNAutocomplete isVisible={false} onClose={jest.fn()} onSelect={jest.fn()} onDismissed={onDismissed} />);

      await fireEvent(screen.getByTestId('modal'), 'dismiss');

      expect(onDismissed).toHaveBeenCalledTimes(1);
    });

    it('is not listed in a new invoice, which has no GRN of its own', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      await renderIn('orange', 'light');

      expect(screen.getByText('GRN 311')).toBeOnTheScreen();
      expect(screen.queryByTestId('grn-picker-current')).not.toBeOnTheScreen();
      expect(screen.queryByText('Current GRN')).not.toBeOnTheScreen();
    });

    it('is hidden while the typed search does not match it', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      await render(<GRNAutocomplete isVisible onClose={jest.fn()} onSelect={jest.fn()} pinnedGrn={pinned} />);
      expect(screen.getByTestId('grn-picker-current')).toBeOnTheScreen();

      await user().type(searchBox(), '311');

      expect(screen.queryByTestId('grn-picker-current')).not.toBeOnTheScreen();
    });
  });

  it('lifts the sheet over the keyboard and draws under the navigation bar', async () => {
    mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
    await renderIn('orange', 'light');

    expect(screen.getByTestId('modal')).toHaveProp('navigationBarTranslucent', true);
    expect(screen.getByTestId('keyboard-avoiding')).toHaveProp('behavior', 'padding');
  });
});
