/**
 * GRN list, printing: when the printer did not confirm the job (print result `unconfirmed`),
 * the snackbar says to check the printer before printing again, as the invoice screens do,
 * and not the plain failure that invites a reprint.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import GRNListFiori from '@/components/GRNListFiori';
import { getAllGRNItems } from '@/services/grn-service';
import { printGRNRange } from '@/services/print-service';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// Every row is drawn, as the list draws the rows on screen.
jest.mock('@shopify/flash-list', () => {
  const mockReact = require('react');
  return {
    FlashList: ({ data, renderItem }: { data: { key: string }[]; renderItem: (info: { item: unknown }) => unknown }) =>
      mockReact.createElement(
        mockReact.Fragment,
        null,
        data.map((item) => mockReact.createElement(mockReact.Fragment, { key: item.key }, renderItem({ item })))
      ),
  };
});
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
// Reduced motion: the loading skeleton's spring would otherwise go on running after the test is over.
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn(), getAssignedCustomerGRNItems: jest.fn() }));
jest.mock('@/features/filters/configs', () => ({
  FILTER_CONFIGS: { 'grn-list': {} },
  GRN_FILTERS: { listKey: 'grn-list', search: { placeholder: 'Search GRNs' } },
}));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
jest.mock('@/features/filters/components/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('@/features/filters/components/ListSearchField', () => ({ ListSearchField: () => null }));
const mockFilters = {
  request: { p_sort_by: 'gr_no', p_sort_order: 'desc' },
  sort: { field: 'gr_no', order: 'desc' },
  search: '',
  values: {},
  hasAny: false,
  setSearch: jest.fn(),
  apply: jest.fn(),
  clear: jest.fn(),
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
// One object for every read: the list loads again whenever the profile it reads is a new one.
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'admin', assignedCustomerIds: [] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const row = (id: string, item_name: string, qty: number, weight: number | null) => ({
  id,
  grn_id: 'grn-fictional-1',
  gr_no: 'RV15001',
  date: '2026-10-01',
  customer_id: 'customer-fictional-1',
  customer_name: 'Fictional Orchard',
  supervisor_name: null,
  registration: null,
  item_name,
  packaging: 'Bag',
  qty,
  stock: qty,
  weight,
  rack: null,
  package_mark: null,
});

const mounted: ReactTestRenderer[] = [];
async function renderList(rows: ReturnType<typeof row>[]) {
  jest.mocked(getAllGRNItems).mockResolvedValue({
    success: true,
    message: '',
    data: { items: rows, pagination: { total_count: rows.length, limit: 20, offset: 0, has_more: false } },
  } as never);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GRNListFiori />);
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

const snackbarText = (tree: ReactTestRenderer) =>
  tree.root.findByType('Snackbar' as never).findAll((node) => (node.type as unknown) === 'Text').map((node) => ([] as unknown[]).concat(node.props.children).join(''));

it.each([
  [{ success: false, error: 'x', unconfirmed: true }, 'The printer did not confirm the job. Check the printer before printing again.'],
  [{ success: false, error: 'x' }, "Couldn't send the print job. Check the printer and try again."],
])('print answer %j shows "%s"', async (answer, text) => {
  jest.mocked(printGRNRange).mockResolvedValue(answer as never);
  const tree = await renderList([row('l1', 'Fictional potatoes', 10, 50)]);

  await act(async () => { await tree.root.findByType('PrintRangeDialog' as never).props.onConfirm('RV15001', 'RV15001'); });

  expect(snackbarText(tree)).toEqual([text]);
});
