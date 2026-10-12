/**
 * Which request each report sends for each kind of account.
 *
 * The server (backend docs/STAFF_GRN_POLICY.md, "Roles after migration 45") gives the
 * all-customers reports to administrators, supervisors and staff, and refuses them to
 * every customer account, also one with several customers. So:
 *   admin, supervisor, staff      the all-customers request
 *   customer with one customer    that customer's request, at once
 *   customer with two customers   a picker first, then the picked customer's request
 * The role hook and the picker are the real ones; only the services are stand-ins.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import ReportsScreen from '../../../../app/(tabs)/reports';
import OperationsDashboardScreen from '../../../../app/reports/operations-dashboard';
import StockSummaryScreen from '../../../../app/reports/stock-summary';
import CustomerActivityScreen from '../../../../app/reports/customer-activity';
import StockAgingScreen from '../../../../app/reports/stock-aging';
import ItemStockSummaryScreen from '../../../../app/reports/item-stock-summary';
import DispatchActivityScreen from '../../../../app/reports/dispatch-activity';
import GRNActivityScreen from '../../../../app/reports/grn-activity';
import InvoiceHistoryScreen from '../../../../app/reports/invoice-history';
import * as reporting from '@/services/reporting';
import * as stockAging from '@/services/reporting/stock-aging-service';
import * as customerActivity from '@/services/reporting/customer-activity-service';
import * as grnActivity from '@/services/reporting/grn-activity-service';
import * as invoiceHistory from '@/services/reporting/invoice-history-service';
import { StockService } from '@/services/stock-service';
import { t as translate } from '@/i18n';
import { getAllGRNItems, getCustomerGRNItems } from '@/services/grn-service';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';

let mockState: Record<string, unknown> = {};
let mockParams: Record<string, string> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
// The customers table as row-level security shows it to the signed-in account.
let mockCustomerRows: { id: string; name: string }[] | Error = [];
const mockCustomerNameQuery = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        in: async (column: string, ids: string[]) => {
          mockCustomerNameQuery(table, columns, column, ids);
          return mockCustomerRows instanceof Error
            ? { data: null, error: mockCustomerRows }
            : { data: mockCustomerRows.filter((row) => ids.includes(row.id)), error: null };
        },
      }),
    }),
  }),
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
// GRN activity is drawn by ReportScaffold (a FlashList) and keeps its choices per facility.
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
}));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn(() => Promise.resolve([])) } }));
jest.mock('@/services/pdf-service', () => ({ generateCustomerStockPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

// Every request is answered with a refusal: the test is about which request is sent.
function mockRefused() {
  return jest.fn(async () => ({ success: false, message: 'not loaded in this test' }));
}
jest.mock('@/services/reporting', () => ({
  getOperationsDashboard: mockRefused(),
  getAllStockSummary: mockRefused(),
  getCustomerStockSummary: mockRefused(),
  getAllDispatchActivity: mockRefused(),
  getCustomerDispatchActivity: mockRefused(),
}));
jest.mock('@/services/reporting/stock-aging-service', () => ({ getAllStockAging: mockRefused(), getCustomerStockAging: mockRefused() }));
jest.mock('@/services/reporting/customer-activity-service', () => ({ getAllCustomerActivity: mockRefused(), getCustomerActivityDetail: mockRefused() }));
jest.mock('@/services/reporting/grn-activity-service', () => ({ getAllGRNActivity: mockRefused(), getCustomerGRNActivity: mockRefused() }));
jest.mock('@/services/reporting/invoice-history-service', () => ({ getAllInvoiceHistory: mockRefused(), getCustomerInvoiceHistory: mockRefused() }));
jest.mock('@/services/stock-service', () => ({ StockService: { getItemWiseStockList: jest.fn() } }));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn(), getCustomerGRNItems: jest.fn() }));

type Profile = { id: string; role: string; assignedCustomerIds: string[]; assignedCustomers?: { id: string; name: string; active: boolean }[] };
const customers = (...ids: string[]) => ids.map((id) => ({ id, name: id === 'c1' ? 'Fictional Traders' : 'Example Agro', active: true }));
const profile = (role: string, ...ids: string[]): Profile => ({ id: 'p1', role, assignedCustomerIds: ids, assignedCustomers: customers(...ids) });

const ACCOUNTS = {
  admin: profile('admin'),
  supervisor: profile('supervisor'),
  staff: profile('staff'),
  'customer with one customer': profile('customer', 'c1'),
  'customer with two customers': profile('customer', 'c1', 'c2'),
} as const;
type Account = keyof typeof ACCOUNTS;
const WAREHOUSE: Account[] = ['admin', 'supervisor', 'staff'];

/** A report screen with its all-customers request and its one-customer request. */
const REPORTS: {
  name: string;
  Screen: React.ComponentType;
  all: jest.Mock;
  one: jest.Mock;
  /** The customer id in the one-customer call's first argument */
  customerOf: (argument: unknown) => unknown;
}[] = [
  { name: 'stock summary', Screen: StockSummaryScreen, all: reporting.getAllStockSummary as jest.Mock, one: reporting.getCustomerStockSummary as jest.Mock, customerOf: (a) => a },
  { name: 'stock aging', Screen: StockAgingScreen, all: stockAging.getAllStockAging as jest.Mock, one: stockAging.getCustomerStockAging as jest.Mock, customerOf: (a) => (a as { customerId: string }).customerId },
  { name: 'customer activity', Screen: CustomerActivityScreen, all: customerActivity.getAllCustomerActivity as jest.Mock, one: customerActivity.getCustomerActivityDetail as jest.Mock, customerOf: (a) => (a as { customerId: string }).customerId },
  { name: 'dispatch activity', Screen: DispatchActivityScreen, all: reporting.getAllDispatchActivity as jest.Mock, one: reporting.getCustomerDispatchActivity as jest.Mock, customerOf: (a) => (a as { customerId: string }).customerId },
  { name: 'GRN activity', Screen: GRNActivityScreen, all: grnActivity.getAllGRNActivity as jest.Mock, one: grnActivity.getCustomerGRNActivity as jest.Mock, customerOf: (a) => (a as { customerId: string }).customerId },
  { name: 'invoice history', Screen: InvoiceHistoryScreen, all: invoiceHistory.getAllInvoiceHistory as jest.Mock, one: invoiceHistory.getCustomerInvoiceHistory as jest.Mock, customerOf: (a) => (a as { customerId: string }).customerId },
];

let tree: ReactTestRenderer | undefined;
const signedIn = (userProfile: unknown) => ({
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile },
  listFilters: { lists: {} },
  reportPrefs: { byScope: {} },
});
async function open(Screen: React.ComponentType, account: Account) {
  mockState = signedIn(ACCOUNTS[account]);
  await act(async () => {
    tree = create(<Screen />);
    await settleQueries();
  });
  return tree!;
}
const pickerRows = () => tree!.root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('report-customer-') && typeof node.props.onPress === 'function');
const pick = async (customerId: string) => {
  await act(async () => {
    tree!.root.findAll((node) => node.props.testID === `report-customer-${customerId}` && typeof node.props.onPress === 'function')[0].props.onPress();
    await settleQueries();
  });
};
const texts = () => tree!.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));

// Reports on the shared layer read through the query client: answers are delivered at once,
// and none is kept from one test to the next.
let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());

beforeEach(() => {
  jest.clearAllMocks();
  forgetQueries();
  mockParams = {};
  jest.mocked(StockService.getItemWiseStockList).mockResolvedValue({
    success: true,
    message: '',
    data: {
      items: [{ item_id: 'item-1', item_name: 'Example Potatoes', total_qty: 100, total_stock: 60, grn_count: 1 }],
      pagination: { totalCount: 1, hasMore: false, limit: 50, offset: 0 },
    },
  });
  const noItems = { success: true, message: '', data: { items: [] } } as never;
  jest.mocked(getAllGRNItems).mockResolvedValue(noItems);
  jest.mocked(getCustomerGRNItems).mockResolvedValue(noItems);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
});

describe.each(REPORTS)('$name', ({ Screen, all, one, customerOf }) => {
  it.each(WAREHOUSE)('%s gets the all-customers request', async (account) => {
    await open(Screen, account);
    // (How often is not this test's subject: see ReportRequests.test.tsx.)
    expect(all).toHaveBeenCalled();
    expect(one).not.toHaveBeenCalled();
    expect(pickerRows()).toHaveLength(0);
    // Not the "no customer linked" dead end that staff used to get.
    expect(texts()).not.toContain('No customer linked');
  });

  it('a customer with one customer goes straight to that customer', async () => {
    await open(Screen, 'customer with one customer');
    expect(all).not.toHaveBeenCalled();
    expect(one).toHaveBeenCalled();
    expect(one.mock.calls.map(([argument]) => customerOf(argument))).toEqual(one.mock.calls.map(() => 'c1'));
    expect(pickerRows()).toHaveLength(0);
  });

  it('a customer with two customers picks one; the all-customers request is never sent', async () => {
    await open(Screen, 'customer with two customers');
    // Before the pick: the picker with both names, and no request at all.
    expect(all).not.toHaveBeenCalled();
    expect(one).not.toHaveBeenCalled();
    expect(pickerRows().map((row) => row.props.testID)).toEqual(['report-customer-c1', 'report-customer-c2']);
    expect(texts()).toEqual(expect.arrayContaining(['Choose a customer', 'Fictional Traders', 'Example Agro']));

    await pick('c2');
    expect(all).not.toHaveBeenCalled();
    expect(one).toHaveBeenCalled();
    expect(one.mock.calls.map(([argument]) => customerOf(argument))).toEqual(one.mock.calls.map(() => 'c2'));
    expect(pickerRows()).toHaveLength(0);
  });
});

describe('the picker for a profile as sign-in stores it (assigned ids, no names)', () => {
  // verifyOTP and the profile reload store the user row plus assignedCustomerIds only.
  const idsOnly = { id: 'p1', role: 'customer', assignedCustomerIds: ['c1', 'c2'] };
  const openSignedIn = async () => {
    mockState = signedIn(idsOnly);
    await act(async () => {
      tree = create(<StockSummaryScreen />);
    });
  };

  it('reads the names of its own customers and shows them', async () => {
    mockCustomerRows = [{ id: 'c2', name: 'Example Agro' }, { id: 'c1', name: 'Fictional Traders' }, { id: 'c9', name: 'Someone Else' }];
    await openSignedIn();
    expect(mockCustomerNameQuery).toHaveBeenCalledWith('customers', 'id, name', 'id', ['c1', 'c2']);
    expect(pickerRows().map((row) => row.props.accessibilityLabel)).toEqual(['Fictional Traders', 'Example Agro']);
    expect(texts()).not.toContain('Customer');

    await pick('c2');
    expect(jest.mocked(reporting.getCustomerStockSummary).mock.calls[0][0]).toBe('c2');
  });

  it('offers no unnamed rows when the names cannot be read, and reads again on Try again', async () => {
    mockCustomerRows = new Error('offline');
    await openSignedIn();
    expect(pickerRows()).toHaveLength(0);
    expect(texts()).toContain('Customer names could not be loaded');
    expect(reporting.getCustomerStockSummary).not.toHaveBeenCalled();

    mockCustomerRows = [{ id: 'c1', name: 'Fictional Traders' }, { id: 'c2', name: 'Example Agro' }];
    const retry = tree!.root.findAll((node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Try again')[0];
    await act(async () => {
      retry.props.onPress();
    });
    expect(pickerRows().map((row) => row.props.accessibilityLabel)).toEqual(['Fictional Traders', 'Example Agro']);
  });

  it('a profile that carries names does not ask the server', async () => {
    await open(StockSummaryScreen, 'customer with two customers');
    expect(mockCustomerNameQuery).not.toHaveBeenCalled();
    expect(pickerRows()).toHaveLength(2);
  });
});

describe('item-wise stock', () => {
  const expand = async () => {
    const card = tree!.root.findAll((node) => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel ?? '').includes('Example Potatoes'))[0];
    await act(async () => {
      card.props.onPress();
    });
  };

  it.each(WAREHOUSE)('%s lists every customer and drills down across customers', async (account) => {
    await open(ItemStockSummaryScreen, account);
    expect(StockService.getItemWiseStockList).toHaveBeenCalledTimes(1);
    expect(jest.mocked(StockService.getItemWiseStockList).mock.calls[0][0]?.customerId).toBeUndefined();

    await expand();
    expect(getAllGRNItems).toHaveBeenCalledTimes(1);
    expect(getCustomerGRNItems).not.toHaveBeenCalled();
  });

  it('a customer with one customer names it on the list and on the drill-down', async () => {
    await open(ItemStockSummaryScreen, 'customer with one customer');
    expect(jest.mocked(StockService.getItemWiseStockList).mock.calls[0][0]?.customerId).toBe('c1');

    await expand();
    expect(getAllGRNItems).not.toHaveBeenCalled();
    expect(getCustomerGRNItems).toHaveBeenCalledWith('c1', { p_filters: { item_ids: ['item-1'], stock_status: 'in_stock' }, p_limit: 100 });
  });

  it('a customer with two customers picks one first', async () => {
    await open(ItemStockSummaryScreen, 'customer with two customers');
    expect(StockService.getItemWiseStockList).not.toHaveBeenCalled();
    expect(pickerRows()).toHaveLength(2);

    await pick('c2');
    expect(jest.mocked(StockService.getItemWiseStockList).mock.calls[0][0]?.customerId).toBe('c2');
    await expand();
    expect(getAllGRNItems).not.toHaveBeenCalled();
    expect(jest.mocked(getCustomerGRNItems).mock.calls[0][0]).toBe('c2');
  });
});

describe('a report opened for a named customer (from Customer activity)', () => {
  it('a customer with two customers is not asked to pick again', async () => {
    mockParams = { customerId: 'c2', customerName: 'Example Agro' };
    await open(StockAgingScreen, 'customer with two customers');
    expect(pickerRows()).toHaveLength(0);
    expect(stockAging.getAllStockAging).not.toHaveBeenCalled();
    expect(stockAging.getCustomerStockAging).toHaveBeenCalledWith({ customerId: 'c2' });
  });
});

describe('operations dashboard', () => {
  it.each([
    ['admin', true],
    ['supervisor', true],
    ['staff', false],
    ['customer with one customer', false],
    ['customer with two customers', false],
  ] as [Account, boolean][])('%s: request sent %s', async (account, sent) => {
    await open(OperationsDashboardScreen, account);
    expect(jest.mocked(reporting.getOperationsDashboard).mock.calls.length > 0).toBe(sent);
  });
});

describe('reports tab', () => {
  const STOCK_AGING_TITLE = translate('reports.titles.stockAging');
  const STOCK_SUMMARY_TITLE = translate('reports.titles.stockSummary');
  const DASHBOARD_TITLE = translate('reports.titles.operationsDashboard');
  it.each([
    ['admin', true, 'View operations and customer reports'],
    ['supervisor', true, 'View operations and customer reports'],
    ['staff', false, 'View operations and customer reports'],
    ['customer with one customer', false, 'View your inventory reports'],
    ['customer with two customers', false, 'View your inventory reports'],
  ] as [Account, boolean, string][])('%s: operations dashboard offered %s', async (account, offered, subtitle) => {
    await open(ReportsScreen, account);
    const shown = texts();
    expect(shown.includes(DASHBOARD_TITLE)).toBe(offered);
    expect(shown).toContain(subtitle);
    // The customer reports are offered to every role.
    expect(shown).toEqual(expect.arrayContaining([STOCK_AGING_TITLE, STOCK_SUMMARY_TITLE]));
  });
});
