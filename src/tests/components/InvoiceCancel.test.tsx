/**
 * The invoice details page cancels, never deletes (backend migration 134): the Overview tab offers "Cancel invoice" to
 * administrators and supervisors, a sheet asks for a reason of 3 to 500 characters, cancel_invoice is sent with the
 * version the page read, and a cancelled invoice shows its tag, date and reason with Edit and Cancel gone.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import InvoiceDetailScreen from '../../../app/invoice-details/[id]';
import { getInvoiceDetails, getInvoiceItemsDetailed, getInvoiceReasons, cancelInvoice } from '@/services/invoice-service';
import type { InvoiceDetailsResponse, InvoiceItemsDetailedResponse } from '@/services/invoice-service';
import { showAlert } from '@/utils/alert';

const mockAuth = { userProfile: { role: 'admin' } };
let mockCanDelete = true;
let mockIsCustomer = false;

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
    selector({ auth: mockAuth, theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isCustomer: mockIsCustomer, canUpdate: !mockIsCustomer, canDelete: mockCanDelete }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }) }));
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
  InvoiceHeroHeader: (props: { cancelled?: boolean }) => (props.cancelled ? 'HeroCancelled' : 'HeroLive'),
  InvoiceTabNavigator: 'InvoiceTabNavigator',
  InvoiceOverviewTab: jest.requireActual('@/components/invoice-details/InvoiceOverviewTab').InvoiceOverviewTab,
  InvoiceLineItemsTab: () => null,
  InvoiceBreakdownTab: () => null,
}));

let renderer: ReturnType<typeof create>;
const texts = () => renderer.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
const byLabel = (label: string) =>
  renderer.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
const press = async (label: string) => {
  await act(async () => { byLabel(label)[0].props.onPress(); });
};
// The sheet's own confirm button has the same label as the page's: it is the last one drawn.
const confirm = async () => {
  await act(async () => { const all = byLabel('Cancel invoice'); all[all.length - 1].props.onPress(); });
};
const type = async (value: string) => {
  const input = renderer.root.find(n => n.props.testID === 'cancel-invoice-reason' && typeof n.props.onChangeText === 'function');
  await act(async () => { input.props.onChangeText(value); });
};

const header = (extra: Record<string, unknown> = {}) => ({
  invoice_number: 10002, invoice_date: '2026-10-01', gr_no: 'A1', total: 100, tax_amount: 5, labour: 0, discount: 0,
  updated_at: '2026-10-02T04:00:00.123Z', customer: { id: 'c1', name: 'Asha Traders' }, ...extra,
});
const detail = (extra: Record<string, unknown> = {}) =>
  ({ success: true, data: { header: header(extra), items: [] } }) as unknown as InvoiceDetailsResponse;

async function open() {
  await act(async () => { renderer = create(<InvoiceDetailScreen />); });
  await act(async () => {
    renderer.root.findByType('InvoiceTabNavigator' as unknown as React.ElementType).props.on_tab_change('overview');
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanDelete = true;
  mockIsCustomer = false;
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false } as InvoiceItemsDetailedResponse);
  jest.mocked(getInvoiceReasons).mockResolvedValue(null);
});
afterEach(async () => { await act(async () => { renderer?.unmount(); }); });

describe('a live invoice', () => {
  it('offers Cancel invoice and no Delete to an administrator or supervisor', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(detail());
    await open();
    expect(byLabel('Cancel invoice')).toHaveLength(1);
    expect(byLabel('Delete Invoice')).toHaveLength(0);
    expect(byLabel('Edit Invoice').length).toBeGreaterThan(0);
  });

  it('offers no Cancel invoice to a role that could not delete', async () => {
    mockCanDelete = false;
    jest.mocked(getInvoiceDetails).mockResolvedValue(detail());
    await open();
    expect(byLabel('Cancel invoice')).toHaveLength(0);
  });

  it('asks for a reason first: nothing is sent for a reason under 3 characters, the sheet says why', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(detail());
    await open();
    await press('Cancel invoice');
    await type(' ab ');
    await confirm();
    expect(cancelInvoice).not.toHaveBeenCalled();
    expect(texts()).toContain('Give a reason of at least 3 characters.');
  });

  it('sends the reason and the version the page read, then reads the invoice again and tells it is cancelled', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValueOnce(detail()).mockResolvedValue(
      detail({ cancelled_at: '2026-10-05T10:00:00Z', cancel_reason: 'Wrong customer', cancelled_by_name: 'Ravi Shah' })
    );
    jest.mocked(cancelInvoice).mockResolvedValue({ success: true, cancelledAt: '2026-10-05T10:00:00Z' });
    await open();
    await press('Cancel invoice');
    await type('Wrong customer');
    await confirm();

    expect(cancelInvoice).toHaveBeenCalledWith('fictional-invoice', 'Wrong customer', '2026-10-02T04:00:00.123Z');
    expect(getInvoiceDetails).toHaveBeenCalledTimes(2);
    expect(showAlert).toHaveBeenCalledWith('Invoice 10002 cancelled.');
    expect(byLabel('Cancel invoice')).toHaveLength(0);
  });

  it('a refusal for payments is worded and the invoice stays as it is', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(detail());
    jest.mocked(cancelInvoice).mockResolvedValue({
      success: false, reason: 'INVOICE_HAS_PAYMENTS', message: 'This invoice has payments recorded against it, so it cannot be cancelled.',
    });
    await open();
    await press('Cancel invoice');
    await type('Duplicate bill');
    await confirm();
    expect(showAlert).toHaveBeenCalledWith("Couldn't cancel invoice", 'This invoice has payments recorded against it, so it cannot be cancelled.');
    expect(getInvoiceDetails).toHaveBeenCalledTimes(1);
  });

  it('STALE_RECORD reads the invoice again; a lost answer reads it again and says it is not confirmed', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(detail());
    jest.mocked(cancelInvoice).mockResolvedValueOnce({ success: false, reason: 'STALE_RECORD', message: 'stale text' });
    await open();
    await press('Cancel invoice');
    await type('Duplicate bill');
    await confirm();
    expect(getInvoiceDetails).toHaveBeenCalledTimes(2);
    expect(showAlert).toHaveBeenCalledWith("Couldn't cancel invoice", 'stale text');

    jest.mocked(cancelInvoice).mockResolvedValueOnce({ success: false, lostAnswer: true });
    await press('Cancel invoice');
    await type('Duplicate bill');
    await confirm();
    expect(getInvoiceDetails).toHaveBeenCalledTimes(3);
    expect(showAlert).toHaveBeenCalledWith('Not confirmed', expect.stringContaining('No answer from the server'));
  });
});

describe('a cancelled invoice', () => {
  const cancelled = { cancelled_at: '2026-10-05T10:00:00Z', cancel_reason: 'Wrong customer', cancelled_by_name: 'Ravi Shah' };

  it('shows the tag, the date, who and why, with Edit and Cancel hidden', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(detail(cancelled));
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['Cancelled on 05/10/26 by Ravi Shah', 'Reason: Wrong customer']));
    expect(byLabel('Cancel invoice')).toHaveLength(0);
    expect(byLabel('Edit Invoice')).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain('HeroCancelled');
  });

  it('shows a customer the date and reason, not who cancelled it', async () => {
    mockIsCustomer = true;
    mockCanDelete = false;
    jest.mocked(getInvoiceDetails).mockResolvedValue(detail(cancelled));
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['Cancelled on 05/10/26', 'Reason: Wrong customer']));
    expect(texts().join('|')).not.toContain('Ravi Shah');
  });
});
