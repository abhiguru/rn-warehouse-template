/**
 * WH-120: the "RECENT CUSTOMERS" list is checked against each customer's current state, through the real customer
 * service (only the server's answer to the customers read is faked). A deleted customer is left out; a deactivated
 * one shows the "Deactivated" tag and cannot be picked on the GRN pickers, but can on the dispatch and order pickers.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CustomerSearchBottomSheet, type CustomerSearchBottomSheetRef } from '../CustomerSearchBottomSheet';
import { RecentCustomersService } from '@/services/recent-customers-service';
import { getAuthenticatedClient } from '@/config/supabaseConfig';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSessionIdentity: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { getRecentCustomers: jest.fn(), addRecentCustomer: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  const sheet = ReactMock.forwardRef((props: object, ref: unknown) => {
    ReactMock.useImperativeHandle(ref, () => ({ expand: jest.fn(), close: jest.fn() }));
    return ReactMock.createElement('BottomSheet', props, (props as { children?: unknown }).children);
  });
  return {
    __esModule: true,
    default: sheet,
    BottomSheetBackdrop: 'BottomSheetBackdrop',
    BottomSheetTextInput: 'BottomSheetTextInput',
    BottomSheetFlatList: ({ data, renderItem }: { data: unknown[]; renderItem: (p: { item: unknown }) => React.ReactNode }) =>
      ReactMock.createElement('BottomSheetFlatList', { data }, data.map((item, index) => ReactMock.createElement(ReactMock.Fragment, { key: index }, renderItem({ item })))),
  };
});

const recent = [
  { id: 'c-live', name: 'Live Traders', timestamp: 3 },
  { id: 'c-off', name: 'Deactivated Traders', timestamp: 2 },
  { id: 'c-gone', name: 'Deleted Traders', timestamp: 1 },
];
const rows = [
  { id: 'c-live', active: true, deleted_at: null },
  { id: 'c-off', active: false, deleted_at: null },
  { id: 'c-gone', active: false, deleted_at: '2026-10-01T00:00:00+00:00' },
];

const inIds = jest.fn();
let tree: ReactTestRenderer;
let selected: jest.Mock;

const mount = async (includeInactive: boolean) => {
  const ref = React.createRef<CustomerSearchBottomSheetRef>();
  selected = jest.fn();
  await act(async () => {
    tree = create(<CustomerSearchBottomSheet ref={ref} onSelect={selected} includeInactive={includeInactive} />);
  });
  await act(async () => { ref.current?.open(); });
};
const entry = (name: string) => tree.root.findAll(n => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith(name))[0];
const texts = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.mocked(RecentCustomersService.getRecentCustomers).mockResolvedValue(recent);
  inIds.mockImplementation(() => Promise.resolve({ data: rows, error: null }));
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ from: () => ({ select: () => ({ in: inIds }) }) } as never);
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.useRealTimers();
});

describe('GRN pickers (deactivated customers hidden)', () => {
  it('leaves out a deleted customer and shows a deactivated one tagged and not selectable', async () => {
    await mount(false);
    expect(inIds).toHaveBeenCalledWith('id', ['c-live', 'c-off', 'c-gone']);
    expect(entry('Deleted Traders')).toBeUndefined();
    expect(entry('Live Traders').props.disabled).toBe(false);
    const off = entry('Deactivated Traders');
    expect(off.props.disabled).toBe(true);
    expect(off.props.accessibilityState).toEqual({ disabled: true });
    expect(off.props.accessibilityLabel).toContain('Deactivated');
    expect(texts()).toContain('Deactivated');
  });

  it('does not select a deactivated recent customer, but selects a live one', async () => {
    await mount(false);
    await act(async () => { entry('Live Traders').props.onPress(); });
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-live', name: 'Live Traders' }));
  });
});

describe('dispatch and order pickers (includeInactive)', () => {
  it('keeps offering a deactivated customer, tagged, and still leaves out a deleted one', async () => {
    await mount(true);
    expect(entry('Deleted Traders')).toBeUndefined();
    const off = entry('Deactivated Traders');
    expect(off.props.disabled).toBe(false);
    expect(off.props.accessibilityLabel).toContain('Deactivated');
    await act(async () => { off.props.onPress(); });
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-off' }));
  });
});

describe('when the current state cannot be read', () => {
  it('shows the picks as stored, all selectable (GRN picker)', async () => {
    jest.mocked(getAuthenticatedClient).mockResolvedValue({
      from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { code: '', message: 'Network request failed' } }) }) }),
    } as never);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await mount(false);
    for (const name of ['Live Traders', 'Deactivated Traders', 'Deleted Traders']) {
      expect(entry(name).props.disabled).toBe(false);
    }
  });
});
