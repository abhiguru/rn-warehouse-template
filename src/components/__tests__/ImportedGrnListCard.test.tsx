/** WH-180: the GRN list card of an imported GRN has no Edit action and keeps Print; another GRN keeps both. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import GRNListFiori from '../GRNListFiori';
import { getGRNListPage } from '@/services/grn-service';

const mockState = { listFilters: { lists: {} }, theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role: 'admin' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockState),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
const mockPermissions = { canCreate: true, canUpdate: true, canDelete: true, isCustomer: false };
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => mockPermissions }));
const mockAccess = { assignedCustomerIds: [] as string[], isCustomerAccount: false };
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => mockAccess }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => true }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false, useNetworkStatus: () => ({ isConnected: true, type: 'wifi' }) }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({ FilteredListHeader: () => null, filteredEmptyProps: () => ({}) }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn(), printFailureMessage: jest.fn() }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, renderItem, keyExtractor }: any) =>
    require('react').createElement(require('react').Fragment, null, data.map((item: any) => require('react').createElement(require('react').Fragment, { key: keyExtractor(item) }, renderItem({ item })))),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('@/services/grn-service', () => ({
  ...jest.requireActual('@/services/grn-service'),
  getGRNListPage: jest.fn(),
}));

const row = (id: string, grNo: string, imported?: boolean) => ({
  id, grn_id: id, grn_item_id: `${id}-i`, gr_no: grNo, date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders', supervisor_name: null,
  registration: null, item_id: 'gur', item_name: 'Fictional Gur', packaging: 'Bag', qty: 10, stock: 10, weight: 12,
  ...(imported === undefined ? {} : { imported }),
});

let tree: ReactTestRenderer;
const open = async (items: unknown[]) => {
  jest.mocked(getGRNListPage).mockResolvedValue({
    success: true,
    data: { items, pagination: { total: items.length, limit: 20, offset: 0, unit: 'receipt', has_more: false } },
  } as never);
  await act(async () => { tree = create(<GRNListFiori />); });
  await act(async () => {});
};
const actionsOf = (id: string) => {
  const card = tree.root.findAll(n => n.props.testID === `grn-card-${id}` && n.props.accessibilityActions !== undefined)[0];
  return (card.props.accessibilityActions as { name: string }[]).map(a => a.name);
};
afterEach(() => act(() => tree.unmount()));

it('an imported GRN card has Print and no Edit, and carries the Imported tag', async () => {
  await open([row('g1', 'A0001', true)]);
  expect(actionsOf('g1')).toEqual(['print']);
  expect(tree.root.findAll(n => n.props.testID === 'grn-card-imported-g1').length).toBeGreaterThan(0);
});

it.each([[false], [undefined]])('a GRN that is not imported (flag %s) keeps Print and Edit and has no tag', async flag => {
  await open([row('g2', 'A0002', flag)]);
  expect(actionsOf('g2')).toEqual(['print', 'edit']);
  expect(tree.root.findAll(n => n.props.testID === 'grn-card-imported-g2')).toHaveLength(0);
});

it('in one list, only the imported card loses Edit', async () => {
  await open([row('g1', 'A0001', true), row('g2', 'A0002', false)]);
  expect(actionsOf('g1')).toEqual(['print']);
  expect(actionsOf('g2')).toEqual(['print', 'edit']);
});
