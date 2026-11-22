/**
 * WH-180: the invoice page of an imported invoice is read-only: the Imported mark shows, and Edit, Cancel invoice and
 * Delete are gone. An invoice that was not imported (or one from a server that does not say) keeps them.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import InvoiceDetailScreen from '../../../app/invoice-details/[id]';
import { getInvoiceDetails, getInvoiceItemsDetailed, getInvoiceReasons } from '@/services/invoice-service';
import type { InvoiceDetailsResponse, InvoiceItemsDetailedResponse } from '@/services/invoice-service';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'fictional-invoice' }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    React.useEffect(() => { callback(); }, [callback]);
  },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { userProfile: { role: 'admin' } }, theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isCustomer: false, role: 'admin', canUpdate: true, canDelete: true }),
}));
jest.mock('@/hooks/useCapability', () => ({ useCapability: () => true }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Portal: 'Portal', Snackbar: 'Snackbar' }));
jest.mock('@/components/skeletons', () => ({ DetailSkeleton: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ ...jest.requireActual('@/utils/alert'), showAlert: jest.fn() }));
jest.mock('@/services/invoice-service', () => ({
  ...jest.requireActual('@/services/invoice-service'),
  getInvoiceDetails: jest.fn(), getInvoiceItemsDetailed: jest.fn(), getInvoiceReasons: jest.fn(), cancelInvoice: jest.fn(),
}));
jest.mock('@/components/invoice-details', () => ({
  // Stand-ins that draw what the test looks at: the Imported mark and a button for the Overview tab.
  InvoiceHeroHeader: (props: { imported?: boolean }) => {
    const { Text } = require('react-native');
    return <Text>{props.imported === true ? 'Imported' : props.imported === false ? 'Not imported' : 'Imported unknown'}</Text>;
  },
  InvoiceTabNavigator: (props: { on_tab_change: (tab: string) => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="overview tab" onPress={() => props.on_tab_change('overview')}>
        <Text>overview</Text>
      </Pressable>
    );
  },
  InvoiceOverviewTab: jest.requireActual('@/components/invoice-details/InvoiceOverviewTab').InvoiceOverviewTab,
  InvoiceLineItemsTab: () => null,
  InvoiceBreakdownTab: () => null,
}));

// A button that is NOT offered must also be absent when mounted but hidden.
const absent = (label: string) => screen.queryAllByLabelText(label, { includeHiddenElements: true });
const detail = (extra: Record<string, unknown> = {}) =>
  ({
    success: true,
    data: {
      header: {
        invoice_number: 10002, invoice_date: '2026-10-01', gr_no: 'A1', total: 100, tax_amount: 5, labour: 0, discount: 0,
        updated_at: '2026-10-02T04:00:00.123Z', customer: { id: 'c1', name: 'Asha Traders' }, ...extra,
      },
      items: [],
    },
  }) as unknown as InvoiceDetailsResponse;
async function open(extra: Record<string, unknown>) {
  jest.mocked(getInvoiceDetails).mockResolvedValue(detail(extra));
  await render(<InvoiceDetailScreen />);
  await userEvent.setup({ delay: 0 }).press(await screen.findByRole('button', { name: 'overview tab' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false } as InvoiceItemsDetailedResponse);
  jest.mocked(getInvoiceReasons).mockResolvedValue(null);
});

it('an imported invoice shows the mark and offers no Edit, Cancel invoice or Delete', async () => {
  await open({ imported: true });
  expect(screen.getByText('Imported')).toBeOnTheScreen();
  // The overview is drawn (its other actions are there), so the missing ones are really closed.
  expect(await screen.findByLabelText('Share PDF')).toBeOnTheScreen();
  expect(absent('Edit')).toHaveLength(0);
  expect(absent('Cancel invoice')).toHaveLength(0);
  expect(absent('Delete Invoice')).toHaveLength(0);
});

it.each([[false], [undefined]])('an invoice that is not imported (flag %s) keeps Edit and Cancel invoice', async flag => {
  await open(flag === undefined ? {} : { imported: flag });
  expect(screen.getByText('Not imported')).toBeOnTheScreen();
  expect((await screen.findAllByRole('button', { name: 'Edit' })).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: 'Cancel invoice' })).toHaveLength(1);
});
