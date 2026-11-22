/**
 * The invoice details page: a failed first load is an error page with Try again (not "Invoice not found"), and the
 * overview shows why a discount or a zero charge was given and who set it (staff and up).
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import InvoiceDetailScreen from '../../../app/invoice-details/[id]';
import { getInvoiceDetails, getInvoiceItemsDetailed, getInvoiceReasons } from '@/services/invoice-service';
import type { InvoiceDetailsResponse, InvoiceItemsDetailedResponse } from '@/services/invoice-service';
import { showAlert } from '@/utils/alert';

const mockAuth = { userProfile: { role: 'admin' } };
let mockIsCustomer = false;
let mockCanUpdate = true;

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
    selector({ auth: mockAuth, theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isCustomer: mockIsCustomer, canUpdate: mockCanUpdate, canDelete: true }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
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
  getInvoiceDetails: jest.fn(), getInvoiceItemsDetailed: jest.fn(), getInvoiceReasons: jest.fn(), cancelInvoice: jest.fn(),
}));
jest.mock('@/components/invoice-details', () => ({
  InvoiceHeroHeader: () => null,
  // A stand-in that draws one button for the Overview tab and calls the page's real on_tab_change.
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

// What is drawn on screen; a check that something is NOT there passes `hidden` to see mounted-but-hidden ones too.
const texts = (hidden = false) => screen.queryAllByText(/^/, { includeHiddenElements: hidden }).map(n => [n.props.children].flat().join(''));
const user = () => userEvent.setup({ delay: 0 });
const pressByLabel = async (label: string) => {
  await user().press(screen.getAllByLabelText(label)[0]);
};

const loaded = {
  success: true,
  data: {
    header: { invoice_number: 10002, invoice_date: '2026-10-01', gr_no: 'A1', total: 100, tax_amount: 5, labour: 0, discount: 10 },
    items: [],
  },
} as unknown as InvoiceDetailsResponse;

async function open() {
  await render(<InvoiceDetailScreen />);
}
const showOverview = async () => {
  await user().press(await screen.findByRole('button', { name: 'overview tab' }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsCustomer = false;
  mockCanUpdate = true;
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false } as InvoiceItemsDetailedResponse);
  jest.mocked(getInvoiceReasons).mockResolvedValue(null);
});

describe('a failed first load', () => {
  it('shows "Couldn\'t load the invoice" with Try again and Go back, no alert and not "Invoice not found"', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue({ success: false, message: 'x', error: 'Bad gateway' });
    await open();
    expect(texts()).toEqual(expect.arrayContaining(["Couldn't load the invoice", 'Check your connection and try again.', 'Try again', 'Go back']));
    expect(texts(true)).not.toContain('Invoice not found');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a thrown failure is the same page', async () => {
    jest.mocked(getInvoiceDetails).mockRejectedValue(new Error('network'));
    await open();
    expect(texts()).toContain("Couldn't load the invoice");
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('Try again reads the invoice again and shows it', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValueOnce({ success: false, message: 'x', error: 'Bad gateway' }).mockResolvedValueOnce(loaded);
    await open();
    await pressByLabel('Try again');
    expect(getInvoiceDetails).toHaveBeenCalledTimes(2);
    expect(texts(true)).not.toContain("Couldn't load the invoice");
    expect(await screen.findAllByRole('button', { name: 'overview tab' })).toHaveLength(1);
  });

  it('Go back leaves the page', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue({ success: false, message: 'x', error: 'Bad gateway' });
    await open();
    await pressByLabel('Go back');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('"Invoice not found" only when the server says so', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue({ success: false, message: 'x', error: 'Invoice not found', notFound: true });
    await open();
    expect(texts()).toContain('Invoice not found');
    expect(texts(true)).not.toContain('Try again');
    expect(showAlert).not.toHaveBeenCalled();
  });
});

describe('the reasons of a discount and a zero charge', () => {
  const reasons = {
    discountReason: 'Damaged bags', discountSetByName: 'Asha Patel', discountSetAt: '2026-10-02T05:00:00Z',
    zeroChargeReason: 'Sample lot', zeroChargeSetByName: 'Ravi Shah', zeroChargeSetAt: '2026-10-03T05:00:00Z',
  };

  it('are shown with "Set by {name}, {date}" to staff and up', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(loaded);
    jest.mocked(getInvoiceReasons).mockResolvedValue(reasons);
    await open();
    await showOverview();
    expect(texts()).toEqual(expect.arrayContaining(['Discount reason', 'Damaged bags', 'Set by Asha Patel, 02/10/26', 'Reason for zero charge', 'Sample lot', 'Set by Ravi Shah, 03/10/26']));
    // A screen reader is given the date in words.
    const labels = screen.queryAllByLabelText(/^/).map(n => n.props.accessibilityLabel as string);
    expect(labels).toEqual(expect.arrayContaining(['Discount reason, Damaged bags, Set by Asha Patel, 2 Oct 2026', 'Reason for zero charge, Sample lot, Set by Ravi Shah, 3 Oct 2026']));
  });

  it('show only the reasons that exist', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(loaded);
    jest.mocked(getInvoiceReasons).mockResolvedValue({ ...reasons, zeroChargeReason: null });
    await open();
    await showOverview();
    expect(texts()).toContain('Damaged bags');
    expect(texts(true)).not.toContain('Reason for zero charge');
  });

  it('are not asked for, and not shown, to a customer', async () => {
    mockIsCustomer = true;
    jest.mocked(getInvoiceDetails).mockResolvedValue(loaded);
    jest.mocked(getInvoiceReasons).mockResolvedValue(reasons);
    await open();
    await showOverview();
    expect(getInvoiceReasons).not.toHaveBeenCalled();
    expect(texts(true)).not.toContain('Damaged bags');
  });

  it('a failed read of the reasons shows nothing and no alert', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(loaded);
    jest.mocked(getInvoiceReasons).mockResolvedValue(null);
    await open();
    await showOverview();
    expect(showAlert).not.toHaveBeenCalled();
    expect(texts(true)).not.toContain('Discount reason');
  });
});

describe('WH-216: in Gujarati, and Edit in the stack header', () => {
  const { setLanguage } = require('@/i18n');
  afterEach(() => setLanguage('en'));
  const editButtons = (hidden = false) => screen.queryAllByLabelText('Edit', { includeHiddenElements: hidden });

  it('says an invoice that cannot be read in Gujarati, with Go back', async () => {
    setLanguage('gu');
    jest.mocked(getInvoiceDetails).mockResolvedValue({ success: false, message: 'x', error: 'Bad gateway' });
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['ઇન્વૉઇસ લોડ કરી શકાયું નથી', 'તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.', 'પાછા જાઓ']));
  });

  it('says an invoice that is gone in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(getInvoiceDetails).mockResolvedValue({ success: false, message: 'x', error: 'Invoice not found', notFound: true });
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['ઇન્વૉઇસ મળ્યું નથી', 'આ ઇન્વૉઇસ ડિલીટ થયું હશે, અથવા તમને તે જોવાની પરવાનગી નહીં હોય.']));
  });

  it('says an invoice that is gone in English, with the exact message', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue({ success: false, message: 'x', error: 'Invoice not found', notFound: true });
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['Invoice not found', 'This invoice may have been deleted, or you may not have access to it.']));
  });

  it('has Edit in the header for a role that may update, and none for a role that may not', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue(loaded);
    await open();
    expect(editButtons().length).toBeGreaterThan(0);
    await screen.unmount();
    mockCanUpdate = false;
    await open();
    expect(editButtons(true)).toHaveLength(0);
  });

  it('has no Edit while the invoice cannot be read', async () => {
    jest.mocked(getInvoiceDetails).mockResolvedValue({ success: false, message: 'x', error: 'Bad gateway' });
    await open();
    expect(editButtons(true)).toHaveLength(0);
  });
});
