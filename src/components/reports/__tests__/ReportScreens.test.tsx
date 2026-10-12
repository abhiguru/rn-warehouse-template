/**
 * Render tests for the report and sensor screens in all four themes
 * (Orange and GCSA, light and dark). Services are mocked.
 */
import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import ReportsScreen from '../../../../app/(tabs)/reports';
import OperationsDashboardScreen from '../../../../app/reports/operations-dashboard';
import StockSummaryScreen from '../../../../app/reports/stock-summary';
import CustomerActivityScreen from '../../../../app/reports/customer-activity';
import StockAgingScreen from '../../../../app/reports/stock-aging';
import ItemStockSummaryScreen from '../../../../app/reports/item-stock-summary';
import DispatchActivityScreen from '../../../../app/reports/dispatch-activity';
import GRNActivityScreen from '../../../../app/reports/grn-activity';
import InvoiceHistoryScreen from '../../../../app/reports/invoice-history';
import SensorsEntry, { SensorsScreen, rowStatus } from '../../../../app/sensors';
import SensorDetailScreen from '../../../../app/sensor-detail/[id]';
import type { SensorDevice } from '@/types/sensor.types';
import { ReportEmptyState } from '@/components/reports';
import { Button } from '@/components/ui/Button';
import * as reporting from '@/services/reporting';
import * as customerActivity from '@/services/reporting/customer-activity-service';
import * as grnActivity from '@/services/reporting/grn-activity-service';
import * as invoiceHistory from '@/services/reporting/invoice-history-service';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'dev-1' }),
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
// GRN activity is drawn by ReportScaffold (a FlashList) and keeps its choices per facility.
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
}));
jest.mock('@/hooks/useRoleBasedAccess', () => ({
  useRoleBasedAccess: () => ({
    isWarehouseUser: true, isManager: true, role: 'admin', reportScope: 'all-customers',
    singleAssignedCustomerId: null, shouldShowListView: true, assignedCustomers: [], assignedCustomerIds: [],
  }),
}));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn(() => Promise.resolve([])) } }));
jest.mock('@/services/pdf-service', () => ({ generateCustomerStockPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const DEVICE: SensorDevice = {
  id: 'dev-1',
  device_name: 'Chamber 2 sensor',
  mac_address: '00:11',
  location: 'Chamber 2',
  active: true,
  health_status: 'warning',
  battery_status: 'GOOD',
  connectivity_status: 'ONLINE',
  is_stale: false,
  last_reading_at: '2026-10-09T10:00:00Z',
  staleness_threshold_minutes: 30,
  consecutive_failures: 0,
  latest_temperature: -18.5,
  latest_humidity: 85,
  latest_reading_timestamp: '2026-10-09T10:00:00Z',
  earliest_reading_at: '2026-01-01T00:00:00Z',
};

jest.mock('@/services/sensor-service', () => ({
  SensorService: {
    pollSensorData: jest.fn(() =>
      Promise.resolve({
        success: true,
        message: '',
        data: {
          success: true,
          poll_timestamp: '2026-10-09T10:00:00Z',
          devices: [DEVICE],
          new_readings: [],
          dashboard: {
            total_active_sensors: 1,
            online_sensors: 1,
            offline_sensors: 0,
            stale_sensors: 0,
            low_battery_count: 1,
            critical_battery_count: 0,
            sensors_with_failures: 0,
            most_recent_sync: '2026-10-09T10:00:00Z',
          },
        },
      })
    ),
  },
}));

jest.mock('@/services/sensor-history-service', () => {
  const actual = jest.requireActual('@/services/sensor-history-service');
  return {
    ...actual,
    getSensorHistory: jest.fn(() =>
      Promise.resolve({
        success: true,
        data: {
          device_id: 'dev-1',
          device_name: 'Chamber 2 sensor',
          location: 'Chamber 2',
          period_days: 7,
          aggregation_interval: '1 day',
          readings: [
            { timestamp: '2026-10-08T00:00:00Z', temperature: -18, humidity: 80 },
            { timestamp: '2026-10-09T00:00:00Z', temperature: -17.5, humidity: 82 },
          ],
          summary: {
            avg_temperature: -17.75,
            min_temperature: -18,
            max_temperature: -17.5,
            avg_humidity: 81,
            min_humidity: 80,
            max_humidity: 82,
            total_readings: 2,
          },
        },
      })
    ),
  };
});

jest.mock('@/services/reporting', () => ({
  getOperationsDashboard: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        kpis: {
          total_grns: 12,
          total_dispatches: 7,
          pending_orders: 3,
          active_customers: 5,
          total_stock_qty: 1200,
          total_stock_weight: 5400.5,
        },
        trends: { grn_daily: [{ date: '2026-10-01', count: 2 }], dispatch_daily: [] },
        recent_activity: [{ type: 'grn', ref: 'A0001', customer: 'Patel Traders', time: '10:00 am' }],
      },
    })
  ),
  getAllStockSummary: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        summary: { total_items: 2, total_quantity: 300 },
        customers: [
          { customer_id: 'c1', customer_name: 'Patel Traders', total_stock: 300, item_count: 2, grn_count: 1 },
        ],
      },
    })
  ),
  getCustomerStockSummary: jest.fn(),
  getAllDispatchActivity: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        summary: { total_dispatches: 3, total_quantity: 140, total_weight: 7000 },
        by_customer: [
          { customer_id: 'c1', customer_name: 'Fictional Traders', dispatch_count: 3, total_quantity: 140, total_weight: 7000 },
        ],
      },
    })
  ),
  getCustomerDispatchActivity: jest.fn(),
}));

jest.mock('@/services/reporting/grn-activity-service', () => ({
  getAllGRNActivity: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        summary: { total_grns: 4, total_quantity: 220 },
        by_customer: [
          { customer_id: 'c1', customer_name: 'Fictional Traders', grn_count: 4, total_quantity: 220, total_weight: 11000, latest_grn_date: '2026-10-01' },
        ],
      },
    })
  ),
  getCustomerGRNActivity: jest.fn(),
}));

jest.mock('@/services/reporting/invoice-history-service', () => ({
  getAllInvoiceHistory: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        summary: { total_invoices: 2, total_customers: 1, total_amount: 5000, total_tax: 500, net_amount: 4500 },
        by_customer: [
          { customer_id: 'c1', customer_name: 'Fictional Traders', invoice_count: 2, total_amount: 5000, net_amount: 4500, latest_invoice_date: '2026-10-01' },
        ],
        by_month: [],
      },
    })
  ),
  getCustomerInvoiceHistory: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        summary: {
          total_invoices: 2, total_amount: 5000, total_labour: 0, total_tax: 500, total_discount: 0, net_amount: 4500,
          paid_count: 1, pending_count: 1, paid_amount: 3000, pending_amount: 1500,
        },
        invoices: [
          {
            invoice_id: 'inv-1', invoice_number: '2026-0042', invoice_date: '2026-10-01', financial_year: '2026-27',
            grn_ref: '311', grn_id: 'g1', total: 3000, labour: 0, discount: 0, tax_amount: 0, net_total: 3000,
            item_count: 1, total_quantity: 10, notes: null,
            payment_status: { status: 'paid', paid_date: null, payment_ref: null }, line_items: [],
          },
        ],
        by_month: [],
      },
    })
  ),
}));

jest.mock('@/services/reporting/customer-activity-service', () => ({
  getAllCustomerActivity: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        summary: { total_customers: 1, total_current_stock: 300, total_grns: 2, total_dispatches: 1, total_invoice_amount: 1500 },
        customers: [
          {
            customer_id: 'c1',
            customer_name: 'Patel Traders',
            customer_city: 'Rajkot',
            current_stock: 300,
            total_grns: 2,
            total_dispatches: 1,
            total_invoice_amount: 1500,
            last_activity_date: '2026-10-01',
            last_activity_type: 'grn',
          },
        ],
      },
    })
  ),
  getCustomerActivityDetail: jest.fn(),
}));

jest.mock('@/services/reporting/stock-aging-service', () => ({
  getAllStockAging: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        summary: { total_customers: 1, total_items: 2, total_quantity: 300, oldest_stock_days: 400, average_age_days: 130, items_over_365_days: 1, qty_over_365_days: 20 },
        by_bucket: {
          '0-120': { item_count: 1, total_quantity: 200, percentage: 66.7 },
          '364+': { item_count: 1, total_quantity: 100, percentage: 33.3 },
        },
        by_customer: [
          { customer_id: 'c1', customer_name: 'Patel Traders', total_stock: 300, average_age_days: 130, oldest_stock_days: 400, items_over_365_days: 1, aging_distribution: {} },
        ],
      },
    })
  ),
  getCustomerStockAging: jest.fn(),
}));

jest.mock('@/services/stock-service', () => ({
  StockService: {
    getItemWiseStockList: jest.fn(() =>
      Promise.resolve({
        success: true,
        data: {
          items: [{ item_id: 'i1', item_name: 'Potato', packaging: '50 kg bag', total_qty: 100, total_stock: 10, grn_count: 1 }],
          pagination: { totalCount: 1, hasMore: false },
        },
      })
    ),
  },
}));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn() }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

// Reports on the shared layer read through the query client: answers are delivered at once,
// and none is kept from one test to the next.
let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
beforeEach(forgetQueries);
afterAll(() => restoreQueries());

async function render(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = {
    theme: { preference: mode, brand },
    auth: { userProfile: { id: 'u1', name: 'Asha', role: 'admin' } },
    listFilters: { lists: {} },
    reportPrefs: { byScope: {} },
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  await act(async () => {
    await settleQueries();
  });
  return tree;
}

function flat(node: ReactTestInstance) {
  const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
  return (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
}

function backgrounds(tree: ReactTestRenderer): unknown[] {
  return tree.root.findAll(n => typeof n.type === 'string').map(n => flat(n).backgroundColor);
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));
}

/** The KPI tiles that are drawn as loading placeholders, by what they say to a screen reader. */
function loadingTiles(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(n => (n.type as unknown) === 'View' && n.props.accessibilityState?.busy === true)
    .map(n => String(n.props.accessibilityLabel))
    .filter(label => label.endsWith(', loading'));
}

/** Presses the first control whose accessibility label starts with the text. */
async function press(tree: ReactTestRenderer, label: string) {
  const control = tree.root.findAll(
    n => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(label)
  )[0];
  await act(async () => {
    control.props.onPress();
  });
}

/** A request that stays unanswered until the test answers it. */
function pending() {
  let answer!: (value: unknown) => void;
  const promise = new Promise<never>(resolve => {
    answer = resolve as (value: unknown) => void;
  });
  return { promise, answer };
}

describe('sensor row status', () => {
  it('shows the most severe of health, connection and battery', () => {
    expect(rowStatus({ ...DEVICE, health_status: 'healthy' })).toEqual({ kind: 'positive', label: 'Healthy' });
    expect(rowStatus(DEVICE)).toEqual({ kind: 'critical', label: 'Warning' });
    expect(rowStatus({ ...DEVICE, health_status: 'critical' })).toEqual({ kind: 'negative', label: 'Critical' });
    expect(rowStatus({ ...DEVICE, health_status: 'healthy', connectivity_status: 'OFFLINE' }).label).toBe('Offline');
    expect(rowStatus({ ...DEVICE, health_status: 'healthy', battery_status: 'LOW' }).label).toBe('Battery low');
  });
});

describe.each(THEMES)('report and sensor screens in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('reports hub', async () => {
    const tree = await render(brand, mode, <ReportsScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.subtle]));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Reports', 'Stock summary', 'Operations dashboard']));
    act(() => tree.unmount());
  });

  it('operations dashboard', async () => {
    const tree = await render(brand, mode, <OperationsDashboardScreen />);
    // The period is the filter bar's chip now, not a segmented control in brand.fill.
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.subtle, t.status.neutral.background]));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Operations dashboard', 'GRNs', 'Total weight', 'Period averages', 'Recent activity', 'A0001']));
    act(() => tree.unmount());
  });

  it('stock summary list', async () => {
    const tree = await render(brand, mode, <StockSummaryScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expect(tree.root.findAll(n => (n.type as unknown) === 'Icon' && n.props.name === 'file-pdf-box').map(n => n.props.color)).toEqual([t.brand.tint]);
    // On the shared report layer: no period, the sort chip, and one card per customer with its share button.
    expect(texts(tree)).toEqual(expect.arrayContaining(['Stock summary', 'All customers', 'Stock', 'Patel Traders', '2 items · 1 GRN', '300']));
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Share PDF for Patel Traders' && typeof n.props.onPress === 'function')).not.toHaveLength(0);
    act(() => tree.unmount());
  });

  it('customer activity list', async () => {
    const tree = await render(brand, mode, <CustomerActivityScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.surface.header]));
    // ReportScaffold: the figures, then one ReportCustomerCard per customer with its city and stock.
    expect(texts(tree)).toEqual(expect.arrayContaining(['Customer activity', 'All customers', 'Customers', 'Stock', 'Patel Traders', '300', 'in stock']));
    expect(texts(tree).some(text => text.startsWith('Rajkot · '))).toBe(true);
    act(() => tree.unmount());
  });

  it('stock aging list with status buckets', async () => {
    const tree = await render(brand, mode, <StockAgingScreen />);
    expect(backgrounds(tree)).toEqual(
      expect.arrayContaining([t.background.base, t.surface.card, t.status.positive.element, t.status.negative.element])
    );
    expect(texts(tree)).toEqual(expect.arrayContaining(['Stock aging', 'All customers', 'Stock age', '0–120 days', 'Over 364 days', 'Patel Traders', 'Average: 121–240 days']));
    act(() => tree.unmount());
  });

  it('item stock summary with low stock tag', async () => {
    const tree = await render(brand, mode, <ItemStockSummaryScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.status.critical.background]));
    // Packaging and GRN count are one fact line (FactLines) on the shared StockItemCard.
    expect(texts(tree)).toEqual(expect.arrayContaining(['Item stock summary', 'Potato', 'Low stock', '50 kg bag · 1 GRN']));
    act(() => tree.unmount());
  });

  it('dispatch activity list', async () => {
    const tree = await render(brand, mode, <DispatchActivityScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['Dispatch activity', 'Bags dispatched', 'Customers with dispatches', 'Fictional Traders', '3 dispatches'])
    );
    act(() => tree.unmount());
  });

  it('GRN activity list', async () => {
    const tree = await render(brand, mode, <GRNActivityScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expect(texts(tree)).toEqual(expect.arrayContaining(['GRN activity', 'All customers', 'GRNs', 'Fictional Traders']));
    act(() => tree.unmount());
  });

  it('invoice history list with its summary', async () => {
    const tree = await render(brand, mode, <InvoiceHistoryScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['Invoice history', 'Invoices', 'Net amount', '₹4,500', 'Customers', 'Fictional Traders'])
    );
    act(() => tree.unmount());
  });

  it('sensors list with one status per sensor', async () => {
    const tree = await render(brand, mode, <SensorsScreen />);
    expect(backgrounds(tree)).toEqual(
      expect.arrayContaining([t.background.base, t.surface.card, t.status.critical.background])
    );
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Chamber 2 sensor', 'Warning', '−18.5°C', '85%', '1 low battery']));
    act(() => tree.unmount());
  });

  it('sensors demo entry', async () => {
    const tree = await render(brand, mode, <SensorsEntry />);
    expect(backgrounds(tree)).toContain(t.background.base);
    expect(texts(tree)).toContain('Sensor monitoring is unavailable in the local demo.');
    act(() => tree.unmount());
  });

  it('sensor detail', async () => {
    const tree = await render(brand, mode, <SensorDetailScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Chamber 2 sensor', 'Warning', 'Online', 'Historical trend']));
    expect(all).toContain('Summary, last 7 days');
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    act(() => tree.unmount());
  });
});

const [BRAND] = BRANDS;

describe('invoice history summary', () => {
  it('shows the totals above the customers, and one customer\'s totals above its invoices', async () => {
    const tree = await render(BRAND, 'light', <InvoiceHistoryScreen />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Invoices', '2', 'Net amount', '₹4,500']));
    expect(loadingTiles(tree)).toEqual([]);

    await press(tree, 'Fictional Traders');
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Paid (1)', '₹3,000', 'Pending (1)', '₹1,500', 'Invoice 2026-0042']));
    expect(all).not.toContain('Net amount');
    // The summary comes before the invoices (style guide 14.10).
    expect(all.indexOf('Paid (1)')).toBeLessThan(all.indexOf('Invoice 2026-0042'));
    act(() => tree.unmount());
  });

  it('draws as many loading tiles as the view shows once loaded', async () => {
    jest.mocked(invoiceHistory.getAllInvoiceHistory).mockImplementationOnce(() => pending().promise);
    const waiting = await render(BRAND, 'light', <InvoiceHistoryScreen />);
    expect(loadingTiles(waiting)).toEqual(['Invoices, loading', 'Net amount, loading']);
    act(() => waiting.unmount());

    const tree = await render(BRAND, 'light', <InvoiceHistoryScreen />);
    jest.mocked(invoiceHistory.getCustomerInvoiceHistory).mockImplementationOnce(() => pending().promise);
    await press(tree, 'Fictional Traders');
    expect(loadingTiles(tree)).toEqual(['Invoices, loading', 'Paid, loading', 'Pending, loading']);
    act(() => tree.unmount());
  });
});

// One customer's stock (items, the out-of-stock section, the PDF) is opened as a route and
// tested with a real store in StockSummaryFlow.test.tsx.

describe('a report that could not be loaded', () => {
  const FAILED: [string, React.ComponentType, jest.Mock, string][] = [
    ['dispatch activity', DispatchActivityScreen, reporting.getAllDispatchActivity as jest.Mock, 'No dispatches in this period'],
    ['GRN activity', GRNActivityScreen, grnActivity.getAllGRNActivity as jest.Mock, 'No GRNs in this period'],
    ['invoice history', InvoiceHistoryScreen, invoiceHistory.getAllInvoiceHistory as jest.Mock, 'No invoices in this period'],
    ['customer activity', CustomerActivityScreen, customerActivity.getAllCustomerActivity as jest.Mock, 'No customer activity'],
    ['stock summary', StockSummaryScreen, reporting.getAllStockSummary as jest.Mock, 'No stock yet'],
  ];
  const refused = { success: false, message: 'The facility refused this report.' };

  beforeEach(() => jest.clearAllMocks());

  it.each(FAILED)('%s: an error state with one "Try again", which shows the loading state', async (_name, Screen, request, emptyTitle) => {
    request.mockResolvedValueOnce(refused);
    const tree = await render(BRAND, 'light', <Screen />);
    expect(request).toHaveBeenCalledTimes(1);

    // The shared empty state in its error tone, with the retry as its own action.
    const states = tree.root.findAllByType(ReportEmptyState);
    expect(states).toHaveLength(1);
    expect(states[0].props).toMatchObject({ icon: 'alert-circle-outline', tone: 'error', actionLabel: 'Try again' });
    const icon = tree.root.findAll(n => (n.type as unknown) === 'Icon' && n.props.name === 'alert-circle-outline')[0];
    expect(icon.props.color).toBe(getTokens(BRAND, 'light').status.negative.text);
    const retries = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button' && /try|retry/i.test(String(n.props.accessibilityLabel)));
    expect(new Set(retries.map(n => n.props.accessibilityLabel))).toEqual(new Set(['Try again']));
    expect(tree.root.findAllByType(Button).filter(button => button.props.children === 'Try again')).toHaveLength(1);

    // Try again: the request is sent once more, and until its answer the screen is loading,
    // not empty ("No GRNs in this period" would be a wrong answer).
    const second = pending();
    request.mockImplementationOnce(() => second.promise);
    await act(async () => {
      states[0].props.onAction();
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(ReportEmptyState)).toHaveLength(0);
    expect(loadingTiles(tree).length).toBeGreaterThan(0);
    expect(texts(tree)).not.toContain(emptyTitle);

    // A second refusal brings the error back.
    await act(async () => {
      second.answer(refused);
      await settleQueries();
    });
    expect(tree.root.findAllByType(ReportEmptyState).map(state => state.props.tone)).toEqual(['error']);
    expect(loadingTiles(tree)).toEqual([]);
    act(() => tree.unmount());
  });
});

// GRN activity searches through the store, which is a fixed stand-in here: its search is
// tested with a real store in GRNActivityFlow.test.tsx.
describe('a customer search that matches nothing', () => {
  const SEARCHED: [string, React.ComponentType][] = [
    ['dispatch activity', DispatchActivityScreen],
    ['invoice history', InvoiceHistoryScreen],
  ];

  it.each(SEARCHED)('%s: offers "Clear search", which brings the customers back', async (_name, Screen) => {
    const tree = await render(BRAND, 'light', <Screen />);
    // The list scrolls with the keyboard open, and a tap on a row is not swallowed by it.
    expect(tree.root.findAll(n => n.props.keyboardShouldPersistTaps === 'handled').length).toBeGreaterThan(0);

    const search = tree.root.findAll(n => typeof n.props.onChangeText === 'function')[0];
    await act(async () => {
      search.props.onChangeText('zzz');
    });
    expect(texts(tree)).not.toContain('Fictional Traders');
    const states = tree.root.findAllByType(ReportEmptyState);
    expect(states).toHaveLength(1);
    expect(states[0].props).toMatchObject({ icon: 'magnify-close', actionLabel: 'Clear search' });

    await act(async () => {
      states[0].props.onAction();
    });
    expect(tree.root.findAllByType(ReportEmptyState)).toHaveLength(0);
    expect(texts(tree)).toContain('Fictional Traders');
    act(() => tree.unmount());
  });
});
