/**
 * WH-121: "Share PDF" on the invoice page. The real PDF service runs against the answers the backend really gives
 * (400 "Document exceeds the limit of ..." / "Document is too long to print ..."); the long-name refusal shows its own
 * title and message, any other failure keeps the old alert.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import InvoiceDetailScreen from '../../../app/invoice-details/[id]';
import { getInvoiceDetails, getInvoiceItemsDetailed, getInvoiceReasons } from '@/services/invoice-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { showAlert } from '@/utils/alert';
import type { InvoiceDetailsResponse, InvoiceItemsDetailedResponse } from '@/services/invoice-service';

const mockFetch = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'fictional-invoice' }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
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
  usePermissions: () => ({ isCustomer: false, role: 'admin', canUpdate: true, canDelete: false }),
}));
jest.mock('@/hooks/useCapability', () => ({ useCapability: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Portal: 'Portal', Snackbar: 'Snackbar' }));
jest.mock('@/components/skeletons', () => ({ DetailSkeleton: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ ...jest.requireActual('@/utils/alert'), showAlert: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'fictional-anon-key' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));
jest.mock('@/services/invoice-service', () => ({
  ...jest.requireActual('@/services/invoice-service'),
  getInvoiceDetails: jest.fn(), getInvoiceItemsDetailed: jest.fn(), getInvoiceReasons: jest.fn(),
}));
jest.mock('@/components/invoice-details', () => ({
  InvoiceHeroHeader: () => null,
  InvoiceTabNavigator: 'InvoiceTabNavigator',
  InvoiceOverviewTab: 'InvoiceOverviewTab',
  InvoiceLineItemsTab: () => null,
  InvoiceBreakdownTab: () => null,
}));

let renderer: ReturnType<typeof create>;
const detail = () =>
  ({
    success: true,
    data: {
      header: {
        invoice_number: 10002, invoice_date: '2026-10-01', gr_no: 'A1', total: 100, tax_amount: 5, labour: 0, discount: 0,
        financial_year: '2025-26', updated_at: '2026-10-02T04:00:00.123Z', customer: { id: 'c1', name: 'Asha Traders' },
      },
      items: [],
    },
  }) as unknown as InvoiceDetailsResponse;
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });

const share = async () => {
  await act(async () => {
    renderer.root.findByType('InvoiceOverviewTab' as unknown as React.ElementType).props.on_share_pdf();
  });
};

beforeEach(async () => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  jest.mocked(getInvoiceDetails).mockResolvedValue(detail());
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false } as InvoiceItemsDetailedResponse);
  jest.mocked(getInvoiceReasons).mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => { renderer = create(<InvoiceDetailScreen />); });
  await act(async () => {
    renderer.root.findByType('InvoiceTabNavigator' as unknown as React.ElementType).props.on_tab_change('overview');
  });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => { renderer.unmount(); });
});

describe('Share PDF on the invoice page', () => {
  it.each([
    ['the line limit', 'Document exceeds the limit of 3,500 lines'],
    ['the page limit', 'Document is too long to print (about 130 pages; the limit is 120)'],
  ])('shows the long-name refusal text when the server refuses for %s', async (_name, error) => {
    mockFetch.mockResolvedValue(reply(400, { success: false, error }));
    await share();
    expect(mockFetch.mock.calls[0][0]).toBe('https://example.invalid/functions/v1/generate-invoice-pdf');
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Too long for a PDF', 'This document is too long to make into a PDF.');
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
  });

  it('keeps the old alert for any other failure', async () => {
    mockFetch.mockResolvedValue(reply(500, { success: false, error: 'Internal error' }));
    await share();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).not.toHaveBeenCalledWith('Too long for a PDF', expect.anything());
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe("Couldn't share invoice");
  });
});
