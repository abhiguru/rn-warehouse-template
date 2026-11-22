/**
 * WH-211: the customer's State sheet (search in English and Gujarati, Gujarati names, the no-match text), the shared
 * SearchableBottomSheet's `scrollToKey`, and the contact person's Call and Email on the customer Overview.
 * The real picker, sheet, search hook and overview run; only the native bottom-sheet module is replaced by a stand-in whose list
 * keeps a ref with spies for the scroll calls (the native list cannot scroll in Jest).
 */
import React from 'react';
import { Linking, Text, TextInput } from 'react-native';
import { act, render as rtlRender, screen, userEvent } from '@testing-library/react-native';
import { CustomerStatePicker } from '@/features/gst/CustomerStatePicker';
import { INDIAN_STATES, stateDisplayName } from '@/features/gst/indianStates';
import { SearchableBottomSheet } from '@/components/common/SearchableBottomSheet';
import { CustomerOverviewTab } from '@/components/customer-details/CustomerOverviewTab';
import { setLanguage, t as tr } from '@/i18n';
import type { Customer } from '@/types/customer.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
// '@/hooks' (the barrel the sheet imports its search hook from) pulls in react-redux, which Jest cannot load as ESM.
jest.mock('react-redux', () => ({ useStore: jest.fn(), useSelector: jest.fn(), useDispatch: () => jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

type MockRenderFn = (info: { item: unknown; index: number }) => unknown;
type MockKeyFn = (item: unknown) => string;
type MockFailFn = (info: { index: number; averageItemLength: number }) => void;
const mockListSpies = { scrollToIndex: jest.fn(), scrollToOffset: jest.fn() };
let mockListProps: { onScrollToIndexFailed?: MockFailFn } = {};
jest.mock('@gorhom/bottom-sheet', () => {
  const R = require('react');
  const { TextInput: RNTextInput } = require('react-native');
  const modal = R.forwardRef((props: { children?: React.ReactNode }, ref: unknown) => {
    R.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    return R.createElement(R.Fragment, null, props.children);
  });
  const list = R.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    R.useImperativeHandle(ref, () => mockListSpies);
    mockListProps = props as typeof mockListProps;
    const data = props.data as unknown[];
    const renderRow = props.renderItem as MockRenderFn;
    const keyOf = props.keyExtractor as MockKeyFn;
    const Empty = props.ListEmptyComponent as React.ComponentType;
    return R.createElement(
      'BottomSheetFlatList',
      null,
      data.length === 0 && Empty ? R.createElement(Empty) : null,
      ...data.map((item: unknown, index: number) => R.createElement(R.Fragment, { key: keyOf(item) }, renderRow({ item, index }))),
    );
  });
  return {
    __esModule: true,
    BottomSheetModal: modal,
    BottomSheetView: 'BottomSheetView',
    BottomSheetBackdrop: 'BottomSheetBackdrop',
    BottomSheetTextInput: RNTextInput,
    BottomSheetFlatList: list,
  };
});

let openUrl: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  searchPlaceholder = () => tr('gst.customer.searchStates');
  mockListSpies.scrollToIndex.mockClear();
  mockListSpies.scrollToOffset.mockClear();
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
});
afterEach(() => {
  setLanguage('en');
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const flush = async (ms = 400) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};
async function render(element: React.ReactElement) {
  await rtlRender(element);
  await flush(0);
}
const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
const count = (text: string) => screen.queryAllByText(text).length;
const stateRows = () => screen.queryAllByTestId(/^customer-state-sheet-/);
const rowIds = () => stateRows().map(n => (n.props.testID as string).replace('customer-state-sheet-', ''));
const rowLabels = () => stateRows().map(n => n.props.accessibilityLabel as string);
// The State sheet's search field has its own placeholder; the generic sheet uses the shared one.
let searchPlaceholder = () => tr('gst.customer.searchStates');
const searchInput = () => screen.getByPlaceholderText(searchPlaceholder());
const type = async (text: string) => {
  if (text === '') await user().clear(searchInput());
  else await user().type(searchInput(), text);
  await flush();
};
async function openStateSheet(value = '', onChange: (name: string) => void = jest.fn()) {
  await render(<CustomerStatePicker value={value} onChange={onChange} />);
  await user().press(screen.getByTestId('customer-state-picker'));
  await flush();
}

describe('the State sheet', () => {
  it('lists "No state" first, then all states, with a search field', async () => {
    await openStateSheet();
    expect(searchInput().props.placeholder).toBe(tr('gst.customer.searchStates'));
    expect(rowIds()).toHaveLength(INDIAN_STATES.length + 1);
    expect(rowIds()[0]).toBe('');
    expect(rowLabels()[0]).toBe(tr('gst.customer.noState'));
  });

  it('typing "guj" leaves Gujarat, and choosing it saves the English name', async () => {
    const onChange = jest.fn();
    await openStateSheet('', onChange);
    await type('guj');
    expect(rowIds()).toEqual(['Gujarat']);
    await user().press(screen.getByTestId('customer-state-sheet-Gujarat'));
    expect(onChange).toHaveBeenCalledWith('Gujarat');
  });

  it('finds a state by its Gujarati name even in English mode', async () => {
    await openStateSheet();
    await type('ગુજ');
    expect(rowIds()).toEqual(['Gujarat']);
    expect(rowLabels()).toEqual(['Gujarat']);
  });

  it('in Gujarati mode shows every state in Gujarati and finds Gujarat by "ગુજ" and by "guj"; the saved value stays English', async () => {
    setLanguage('gu');
    const onChange = jest.fn();
    await openStateSheet('', onChange);
    const labels = rowLabels();
    for (const state of INDIAN_STATES) expect(labels).toContain(stateDisplayName(state.name, 'gu'));
    expect(stateDisplayName('Gujarat', 'gu')).toBe('ગુજરાત');
    expect(labels).not.toContain('Gujarat');
    await type('ગુજ');
    expect(rowLabels()).toEqual(['ગુજરાત']);
    await type('');
    await type('guj');
    expect(rowLabels()).toEqual(['ગુજરાત']);
    await user().press(screen.getByTestId('customer-state-sheet-Gujarat'));
    expect(onChange).toHaveBeenCalledWith('Gujarat');
  });

  it('drops the "No state" row while a search is typed', async () => {
    await openStateSheet();
    await type('raj');
    expect(rowIds()).not.toContain('');
    expect(rowIds()).toContain('Rajasthan');
  });

  it('shows the no-match text once, with the shared hint only once', async () => {
    await openStateSheet();
    await type('zzz');
    expect(rowIds()).toEqual([]);
    expect(count(tr('gst.customer.noStateMatch', { search: 'zzz' }))).toBe(1);
    expect(screen.getByText('No state matches "zzz".')).toBeOnTheScreen();
    expect(count(tr('components.searchSheet.noMatchHint'))).toBe(1);
  });

  it('shows the no-match text in Gujarati', async () => {
    setLanguage('gu');
    await openStateSheet();
    await type('zzz');
    expect(screen.getByText('"zzz" સાથે મળતું કોઈ રાજ્ય નથી.')).toBeOnTheScreen();
  });

  it('marks the saved state selected', async () => {
    await openStateSheet('Gujarat');
    const selected = stateRows().filter(n => n.props.accessibilityState?.selected === true);
    expect(selected.map(n => n.props.testID)).toEqual(['customer-state-sheet-Gujarat']);
  });

  it('opens scrolled to the saved state; "No state" and a free-text state do not scroll', async () => {
    await openStateSheet('Gujarat');
    expect(mockListSpies.scrollToIndex).toHaveBeenCalledTimes(1);
    // index 0 is "No state", states follow in list order
    const gujaratIndex = INDIAN_STATES.findIndex(s => s.name === 'Gujarat') + 1;
    expect(mockListSpies.scrollToIndex).toHaveBeenCalledWith({ index: gujaratIndex, animated: false, viewPosition: 0 });
    await screen.unmount();
    mockListSpies.scrollToIndex.mockClear();
    await openStateSheet('');
    expect(mockListSpies.scrollToIndex).not.toHaveBeenCalled();
    await screen.unmount();
    await openStateSheet('Gujrat (old text)');
    expect(mockListSpies.scrollToIndex).not.toHaveBeenCalled();
  });
});

describe('SearchableBottomSheet scrollToKey', () => {
  beforeEach(() => {
    searchPlaceholder = () => tr('common.search');
  });
  type Row = { id: string };
  const rows: Row[] = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));
  const searchFn = async (query: string) => rows.filter(r => r.id.includes(query.toLowerCase()));
  const sheet = (props: { isVisible?: boolean; scrollToKey?: string; fn?: (q: string) => Promise<Row[]> }) => (
    <SearchableBottomSheet<Row>
      isVisible={props.isVisible ?? true}
      onClose={jest.fn()}
      onSelect={jest.fn()}
      title="Choose"
      searchFn={props.fn ?? searchFn}
      renderItem={row => <Text>{row.id}</Text>}
      keyExtractor={row => row.id}
      minQueryLength={0}
      scrollToKey={props.scrollToKey}
    />
  );

  it('scrolls to the chosen item on the first unfiltered list, not animated', async () => {
    await render(sheet({ scrollToKey: 'd' }));
    await flush();
    expect(mockListSpies.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(mockListSpies.scrollToIndex).toHaveBeenCalledWith({ index: 3, animated: false, viewPosition: 0 });
  });

  it('does not scroll again when the list is filtered and cleared in the same opening', async () => {
    await render(sheet({ scrollToKey: 'd' }));
    await flush();
    mockListSpies.scrollToIndex.mockClear();
    await type('d');
    await type('');
    expect(mockListSpies.scrollToIndex).not.toHaveBeenCalled();
  });

  it('scrolls again on the next opening (the sheet is mounted again for each opening, as the State picker does)', async () => {
    await render(sheet({ scrollToKey: 'd' }));
    await flush();
    await screen.rerender(<></>);
    await flush();
    mockListSpies.scrollToIndex.mockClear();
    await screen.rerender(sheet({ isVisible: true, scrollToKey: 'd' }));
    await flush();
    expect(mockListSpies.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(mockListSpies.scrollToIndex).toHaveBeenCalledWith({ index: 3, animated: false, viewPosition: 0 });
  });

  it('does not scroll for a key that is not in the list, for the first item, or with no key', async () => {
    for (const scrollToKey of ['zz', 'a', undefined]) {
      await render(sheet({ scrollToKey }));
      await flush();
      expect(mockListSpies.scrollToIndex).not.toHaveBeenCalled();
      await screen.unmount();
    }
  });

  it('retries near the row when it is not measured yet (onScrollToIndexFailed)', async () => {
    await render(sheet({ scrollToKey: 'd' }));
    await flush();
    await act(async () => mockListProps.onScrollToIndexFailed!({ index: 3, averageItemLength: 50 }));
    expect(mockListSpies.scrollToOffset).toHaveBeenCalledWith({ offset: 150, animated: false });
    mockListSpies.scrollToIndex.mockClear();
    await flush(150);
    expect(mockListSpies.scrollToIndex).toHaveBeenCalledWith({ index: 3, animated: false, viewPosition: 0 });
  });

  it('leaves other callers unchanged: the list renders the same rows and calls no scroll', async () => {
    await render(sheet({}));
    await flush();
    expect(screen.queryAllByText(/^.$/).map(n => n.props.children)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(mockListSpies.scrollToIndex).not.toHaveBeenCalled();
    expect(mockListSpies.scrollToOffset).not.toHaveBeenCalled();
  });
});

describe('the customer Overview contact person', () => {
  const customer = {
    id: 'c1', name: 'Test Foods', mobile: '9999900302', city: 'Rajkot', gst: '', active: true, created_at: '2026-01-01',
    contact_name: 'Test Person', contact_mobile: '9999900399', contact_email: 'person@example.com',
  } as unknown as Customer;
  const byLabel = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

  it("tapping the contact person's mobile opens the dialler and the email opens a new mail", async () => {
    await render(<CustomerOverviewTab customer={customer} busy={false} onToggleActive={jest.fn()} />);
    expect(screen.getByText('Test Person')).toBeOnTheScreen();
    await user().press(byLabel('Call Test Person'));
    expect(openUrl).toHaveBeenLastCalledWith('tel:9999900399');
    await user().press(byLabel('Email Test Person'));
    expect(openUrl).toHaveBeenLastCalledWith('mailto:person@example.com');
  });

  it("keeps the customer's own Call action separate from the contact person's", async () => {
    await render(<CustomerOverviewTab customer={customer} busy={false} onToggleActive={jest.fn()} />);
    await user().press(byLabel('Call Test Foods'));
    expect(openUrl).toHaveBeenLastCalledWith('tel:9999900302');
  });

  it('a contact person with only a number shows the type alone, and an empty value stays plain', async () => {
    const onlyNumber = { ...customer, contact_name: '', contact_email: '' } as unknown as Customer;
    await render(<CustomerOverviewTab customer={onlyNumber} busy={false} onToggleActive={jest.fn()} />);
    expect(screen.getByText(tr('customers.form.contactPerson'))).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Email/ })).not.toBeOnTheScreen();
    await user().press(byLabel(`Call ${tr('customers.form.contactPerson')}`));
    expect(openUrl).toHaveBeenLastCalledWith('tel:9999900399');
  });

  it('shows no contact person card when all three values are empty', async () => {
    const none = { ...customer, contact_name: '', contact_mobile: '', contact_email: '' } as unknown as Customer;
    await render(<CustomerOverviewTab customer={none} busy={false} onToggleActive={jest.fn()} />);
    expect(screen.queryByText(tr('customers.form.contactPerson'))).not.toBeOnTheScreen();
  });
});
