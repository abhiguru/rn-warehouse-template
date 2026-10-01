import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import InvoiceDetailScreen from '../../../app/invoice-details/[id]';
import { getInvoiceDetails, getInvoiceItemsDetailed } from '@/services/invoice-service';
import type { InvoiceDetailsResponse } from '@/services/invoice-service';

const mockAuth = { userProfile: { role: 'admin' } };
const grnId = '00000000-0000-4000-8000-000000000123';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'fictional-invoice' }),
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('@/store/hooks', () => ({ useAppSelector: () => mockAuth }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/theme/fioriColors', () => ({
  useFioriColors: () => ({ colors: new Proxy({}, { get: () => '#ffffff' }) }),
}));
jest.mock('@/hooks/useListColors', () => ({ useListColors: () => new Proxy({}, { get: () => '#ffffff' }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Portal: 'Portal', Snackbar: 'Snackbar' }));
jest.mock('@/components/skeletons', () => ({ DetailSkeleton: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/services/invoice-service', () => ({
  getInvoiceDetails: jest.fn(), getInvoiceItemsDetailed: jest.fn(), deleteInvoice: jest.fn(),
}));
jest.mock('@/components/invoice-details', () => ({
  InvoiceHeroHeader: () => null,
  InvoiceTabNavigator: 'InvoiceTabNavigator',
  InvoiceOverviewTab: () => null,
  InvoiceLineItemsTab: () => null,
  InvoiceBreakdownTab: jest.requireActual('@/components/invoice-details/InvoiceBreakdownTab').InvoiceBreakdownTab,
}));

let renderer: ReturnType<typeof create>;

async function openBreakdown(grn: Record<string, string | undefined>, headerNumber = 'IRP05') {
  // Reproduce the wire response: get_invoice_data supplies header.gr_no and
  // grn.gr_no, while older deployments can supply grn.number instead.
  jest.mocked(getInvoiceDetails).mockResolvedValue({
    success: true,
    data: {
      header: {
        invoice_number: 20261005, invoice_date: '2026-10-01', gr_no: headerNumber,
        total: 182, tax_amount: 9, labour: 20, discount: -2.5, grn,
      },
      items: [],
    },
  } as unknown as InvoiceDetailsResponse);
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false });
  await act(async () => { renderer = create(<InvoiceDetailScreen />); });
  await act(async () => {
    renderer.root.findByType('InvoiceTabNavigator' as unknown as React.ElementType)
      .props.on_tab_change('breakdown');
  });
}

beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { await act(async () => { renderer?.unmount(); }); });

it.each([undefined, ''])('shows the saved GRN number when nested number is %s and navigates by UUID', async number => {
  await openBreakdown({ id: grnId, gr_no: 'IRP05', number });
  const link = renderer.root.findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.props.accessibilityLabel === 'View GRN IRP05');
  expect(link).toBeDefined();
  expect(link!.findAllByType(Text).some(node =>
    [node.props.children].flat().join('') === 'GRN IRP05'
  )).toBe(true);
  await act(async () => { link!.props.onPress(); });
  expect(router.push).toHaveBeenCalledWith(`/grn-details/${grnId}`);
});

it('retains the legacy nested GRN number and UUID navigation', async () => {
  await openBreakdown({ id: grnId, number: 'LEGACY01' }, '');
  const link = renderer.root.findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.props.accessibilityLabel === 'View GRN LEGACY01');
  expect(link).toBeDefined();
  await act(async () => { link!.props.onPress(); });
  expect(router.push).toHaveBeenCalledWith(`/grn-details/${grnId}`);
});

it('does not invent a navigation target from the printed number when the UUID is absent', async () => {
  await openBreakdown({ gr_no: 'IRP05' });
  expect(renderer.root.findAll(node => typeof node.props.onPress === 'function').filter(node =>
    node.props.accessibilityLabel?.startsWith('View GRN')
  )).toHaveLength(0);
  expect(router.push).not.toHaveBeenCalled();
});
