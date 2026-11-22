import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import InvoiceDetailScreen from '../../../app/invoice-details/[id]';
import { getInvoiceDetails, getInvoiceItemsDetailed } from '@/services/invoice-service';
import type { InvoiceDetailsResponse, InvoiceItemsDetailedResponse } from '@/services/invoice-service';

const mockAuth = { userProfile: { role: 'admin' } };
const grnId = '00000000-0000-4000-8000-000000000123';

// The screen's focus callback, kept so a test can bring the screen "back into view".
let mockFocus: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'fictional-invoice' }),
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    mockFocus = callback;
    // The navigator runs the callback once when the screen first gains focus.
    React.useEffect(() => { callback(); }, [callback]);
  },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: mockAuth, theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Portal: 'Portal', Snackbar: 'Snackbar' }));
jest.mock('@/components/skeletons', () => ({ DetailSkeleton: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/services/invoice-service', () => ({
  getInvoiceDetails: jest.fn(), getInvoiceItemsDetailed: jest.fn(), getInvoiceReasons: jest.fn(async () => null), cancelInvoice: jest.fn(),
}));
jest.mock('@/components/invoice-details', () => ({
  InvoiceHeroHeader: () => null,
  // A stand-in that draws one button for the Breakdown tab and calls the page's real on_tab_change.
  InvoiceTabNavigator: (props: { on_tab_change: (tab: string) => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="breakdown tab" onPress={() => props.on_tab_change('breakdown')}>
        <Text>breakdown</Text>
      </Pressable>
    );
  },
  InvoiceOverviewTab: () => null,
  InvoiceLineItemsTab: () => null,
  InvoiceBreakdownTab: jest.requireActual('@/components/invoice-details/InvoiceBreakdownTab').InvoiceBreakdownTab,
}));

const user = () => userEvent.setup({ delay: 0 });
const showBreakdown = async () => {
  await user().press(await screen.findByRole('button', { name: 'breakdown tab' }));
};
// Links to a GRN or a dispatch (a negative check must also see a mounted-but-hidden one).
const grnLinks = (hidden = false) => screen.queryAllByLabelText(/^View GRN/, { includeHiddenElements: hidden });

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
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false } as InvoiceItemsDetailedResponse);
  await render(<InvoiceDetailScreen />);
  await showBreakdown();
}

beforeEach(() => { jest.clearAllMocks(); });

it.each([undefined, ''])('shows the saved GRN number when nested number is %s and navigates by UUID', async number => {
  await openBreakdown({ id: grnId, gr_no: 'IRP05', number });
  const link = await screen.findByLabelText('View GRN IRP05');
  expect(within(link).getByText('GRN IRP05')).toBeOnTheScreen();
  await user().press(link);
  expect(router.push).toHaveBeenCalledWith(`/grn-details/${grnId}?tab=overview`);
});

it('retains the legacy nested GRN number and UUID navigation', async () => {
  await openBreakdown({ id: grnId, number: 'LEGACY01' }, '');
  await user().press(await screen.findByLabelText('View GRN LEGACY01'));
  expect(router.push).toHaveBeenCalledWith(`/grn-details/${grnId}?tab=overview`);
});

it('does not invent a navigation target from the printed number when the UUID is absent', async () => {
  await openBreakdown({ gr_no: 'IRP05' });
  // The breakdown is drawn (so a missing link is not a page that never loaded).
  expect(await screen.findByText('Charges breakdown')).toBeOnTheScreen();
  expect(grnLinks(true)).toHaveLength(0);
  expect(router.push).not.toHaveBeenCalled();
});

it('opens a billed dispatch by its id, not by its printed number', async () => {
  const dispatchId = '00000000-0000-4000-8000-000000000777';
  jest.mocked(getInvoiceDetails).mockResolvedValue({
    success: true,
    data: {
      header: { invoice_number: 20261005, invoice_date: '2026-10-01', gr_no: 'IRP05', total: 182, tax_amount: 9, labour: 20, discount: 0, grn: { id: grnId, gr_no: 'IRP05' } },
      items: [{
        item_id: 'line-1', charge: 5, tax: 5, duration: 1, no_of_days: 30, labour_rate: 2,
        catalog: { name: 'Example Potatoes' }, grn_item: { id: 'grn-item-1', original_quantity: 100 },
        dispatch: { disp_id: dispatchId, disp_no: 'I2660', quantity: 20 },
      }],
    },
  } as unknown as InvoiceDetailsResponse);
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false } as InvoiceItemsDetailedResponse);
  await render(<InvoiceDetailScreen />);
  await showBreakdown();

  await user().press(await screen.findByLabelText(/I2660/));

  expect(router.push).toHaveBeenCalledWith(`/dispatch-details/${dispatchId}`);
});

it('loads the invoice again when the screen comes back into view after an edit', async () => {
  await openBreakdown({ id: grnId, gr_no: 'IRP05' });
  // The mount loads once; the first focus is the mount and does not load again.
  expect(getInvoiceDetails).toHaveBeenCalledTimes(1);

  await act(async () => { mockFocus!(); });
  expect(getInvoiceDetails).toHaveBeenCalledTimes(2);
  expect(getInvoiceDetails).toHaveBeenLastCalledWith('fictional-invoice');
});
