/**
 * Render tests for the report and sensor screens in all four themes
 * (Orange and the sample brand, light and dark). Services are mocked.
 */
import React from 'react';
import { registerSampleBrand, SAMPLE_BRAND } from '@/tests/helpers/sampleBrand';

registerSampleBrand(); // Orange plus the fictional sample brand (WH-141)
import { act, render, screen, userEvent } from '@testing-library/react-native';
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
import SensorsScreen from '../../../../app/sensors';
import { rowStatus } from '@/features/sensors/sensorStatus';
import SensorDetailScreen from '../../../../app/sensor-detail/[id]';
import type { SensorDevice } from '@/types/sensor.types';
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'dev-1' }),
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
// GRN activity is drawn by ReportScaffold (a FlashList) and keeps its choices per facility.
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
  onOperatorServerChange: () => () => undefined,
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

const mockDevice: SensorDevice = {
  id: 'dev-1',
  device_name: 'Chamber 2 sensor',
  mac_address: '00:11',
  location: 'Chamber 2',
  active: true,
  health_status: 'warning',
  battery_status: 'OK',
  connectivity_status: 'ONLINE',
  is_stale: false,
  last_reading_at: '2026-10-09T10:00:00Z',
  // Five minutes ago: the screens measure staleness against the time of the test.
  measured_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  battery_low: true,
  staleness_threshold_minutes: 30,
  consecutive_failures: 0,
  latest_temperature: -18.5,
  latest_humidity: 85,
  latest_reading_timestamp: '2026-10-09T10:00:00Z',
  earliest_reading_at: '2026-01-01T00:00:00Z',
};

jest.mock('@/services/sensor-service', () => ({
  getSnapshot: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        success: true,
        poll_timestamp: '2026-10-09T10:00:00Z',
        devices: [mockDevice],
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
  getDevice: jest.fn(() => Promise.resolve({ success: true, data: { device: { ...mockDevice, first_reading_at: mockDevice.earliest_reading_at, hub: null } } })),
}));
// The sensor screens re-read on a timer; no test here reaches a facility.
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }), useIsOffline: () => false }));

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
        // `net_amount` is what a server before backend migration 61 sends (labour and tax counted twice): not shown.
        summary: { total_invoices: 2, total_customers: 1, total_amount: 4500, total_tax: 500, net_amount: 5000 },
        by_customer: [
          { customer_id: 'c1', customer_name: 'Fictional Traders', invoice_count: 2, total_amount: 4500, net_amount: 5000, latest_invoice_date: '2026-10-01' },
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

async function show(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = {
    theme: { preference: mode, brand },
    auth: { userProfile: { id: 'u1', name: 'Asha', role: 'admin' } },
    listFilters: { lists: {} },
    reportPrefs: { byScope: {} },
  };
  await render(element);
  await settle();
}

const settle = () =>
  act(async () => {
    await settleQueries();
  });

type JsonNode = { type: string; props: Record<string, any>; children: unknown[] | null };
/** Every rendered host element, in order, from the screen's JSON: for what no query reaches (a background colour, an icon's colour). */
function hostNodes(): JsonNode[] {
  const out: JsonNode[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    out.push(node as JsonNode);
    ((node as JsonNode).children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return out;
}

function backgrounds(): unknown[] {
  return hostNodes().map(node => (StyleSheet.flatten(node.props.style) ?? {}).backgroundColor);
}

/** The colours of the icons of one name (icons are host elements named "Icon", with no role or text). */
const iconColors = (name: string) => hostNodes().filter(node => node.type === 'Icon' && node.props.name === name).map(node => node.props.color);

/** Each text is on screen at least once (hidden or not, as the old tree walk saw it). */
function expectTexts(...texts: (string | RegExp)[]) {
  for (const text of texts) expect(screen.getAllByText(text, { includeHiddenElements: true })[0]).toBeOnTheScreen();
}
const hasText = (text: string) => screen.queryAllByText(text, { includeHiddenElements: true }).length > 0;
/** Where a text sits among all the texts on screen, in order. */
function textOrder(): string[] {
  return screen.getAllByText(/./, { includeHiddenElements: true }).map(node => [node.props.children].flat().join(''));
}

/** The KPI tiles that are drawn as loading placeholders, by what they say to a screen reader. */
function loadingTiles(): string[] {
  return screen
    .queryAllByLabelText(/, loading$/, { includeHiddenElements: true })
    .filter(node => node.props.accessibilityState?.busy === true)
    .map(node => String(node.props.accessibilityLabel));
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
    const now = Date.now();
    const fine = { ...mockDevice, battery_low: false };
    expect(rowStatus({ ...fine, health_status: 'healthy' }, now)).toEqual({ kind: 'positive', label: 'Sensor OK' });
    expect(rowStatus(fine, now)).toEqual({ kind: 'critical', label: 'Warning' });
    expect(rowStatus({ ...fine, health_status: 'critical' }, now)).toEqual({ kind: 'negative', label: 'Critical' });
    expect(rowStatus({ ...fine, health_status: 'healthy', connectivity_status: 'OFFLINE' }, now).label).toBe('Offline');
    expect(rowStatus({ ...fine, health_status: 'healthy', battery_status: 'LOW' }, now).label).toBe('Battery low');
  });
});

describe.each(THEMES)('report and sensor screens in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('reports hub', async () => {
    await show(brand, mode, <ReportsScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.subtle]));
    expectTexts('Reports', 'Stock summary', 'Operations dashboard');
  });

  it('operations dashboard', async () => {
    await show(brand, mode, <OperationsDashboardScreen />);
    // The period is the filter bar's chip now, not a segmented control in brand.fill.
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.subtle, t.status.neutral.background]));
    expectTexts('Operations dashboard', 'GRNs', 'Total stock', 'Period averages', 'LATEST ACTIVITY (ANY DATE)', 'A0001');
    // The answer's total_stock_weight (5,400.5 kg) is a total: no tile for it.
    expect(hasText('Total weight')).toBe(false);
  });

  it('stock summary list', async () => {
    await show(brand, mode, <StockSummaryScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    // The header's stock PDF of every customer, and the one customer's share button.
    expect(iconColors('file-pdf-box')).toEqual([t.brand.tint, t.brand.tint]);
    // On the shared report layer: no period, the sort chip, and one card per customer with its share button.
    expectTexts('Stock summary', 'All customers', 'Stock', 'Patel Traders', '2 items · 1 GRN', '300');
    expect(screen.getByRole('button', { name: 'Share PDF for Patel Traders' })).toBeOnTheScreen();
  });

  it('customer activity list', async () => {
    await show(brand, mode, <CustomerActivityScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.surface.header]));
    // ReportScaffold: the figures, then one ReportCustomerCard per customer with its city and stock.
    expectTexts('Customer activity', 'All customers', 'Customers', 'Stock', 'Patel Traders', '300', 'in stock', /^Rajkot · /);
  });

  it('stock aging list with status buckets', async () => {
    await show(brand, mode, <StockAgingScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.status.positive.element, t.status.negative.element]));
    expectTexts('Stock aging', 'All customers', 'Stock age', '0–120 days', 'Over 364 days', 'Patel Traders', 'Average: 121–240 days');
  });

  it('item stock summary with low stock tag', async () => {
    await show(brand, mode, <ItemStockSummaryScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.status.critical.background]));
    // Packaging and GRN count are one fact line (FactLines) on the shared StockItemCard.
    expectTexts('Item stock summary', 'Potato', 'Low stock', '50 kg bag · 1 GRN');
  });

  it('dispatch activity list', async () => {
    await show(brand, mode, <DispatchActivityScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expectTexts('Dispatch activity', 'All customers', 'Units dispatched', 'Fictional Traders', '3 dispatches');
  });

  it('GRN activity list', async () => {
    await show(brand, mode, <GRNActivityScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expectTexts('GRN activity', 'All customers', 'GRNs', 'Fictional Traders');
  });

  it('invoice history list with its summary', async () => {
    await show(brand, mode, <InvoiceHistoryScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expectTexts('Invoice history', 'All customers', 'Invoices', 'Amount', '₹4,500', 'Fictional Traders', '2 invoices · Latest 01/10/26');
  });

  it('sensors list with one status per sensor', async () => {
    await show(brand, mode, <SensorsScreen />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.status.critical.background]));
    // The battery is low: the row's tag says so instead of a bare "Warning", the
    // strip over the list names it, and the figures count it.
    expectTexts('Temperature and humidity', 'Chamber 2 sensor', '−18.5°C', '85%', '1 low battery', 'Battery low');
  });

  it('sensor detail', async () => {
    await show(brand, mode, <SensorDetailScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expectTexts('Chamber 2 sensor', 'Battery low', 'Online', 'Historical trend', 'All readings, last 7 days');
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
  });
});

const [BRAND] = BRANDS;

// One customer's figures, and its three loading tiles, are tested with a real store in
// InvoiceHistoryFlow.test.tsx: opening a customer pushes a route there.
describe('invoice history summary', () => {
  it('shows the totals above the customers, with the amount on each customer', async () => {
    await show(BRAND, 'light', <InvoiceHistoryScreen />);
    const all = textOrder();
    expectTexts('Invoices', '2', 'Amount', '₹4,500');
    expect(loadingTiles()).toEqual([]);
    // The summary comes before the customers (style guide 14.10).
    expect(all.indexOf('Amount')).toBeLessThan(all.indexOf('Fictional Traders'));
    expect(all.lastIndexOf('₹4,500')).toBeGreaterThan(all.indexOf('Fictional Traders'));
  });

  it('draws as many loading tiles as the customers level shows once loaded', async () => {
    const waiting = pending();
    jest.mocked(invoiceHistory.getAllInvoiceHistory).mockImplementationOnce(() => waiting.promise);
    await show(BRAND, 'light', <InvoiceHistoryScreen />);
    expect(loadingTiles()).toHaveLength(2);
    await act(async () => {
      waiting.answer({
        success: true,
        data: { summary: { total_invoices: 0, total_customers: 0, total_amount: 0, total_tax: 0, net_amount: 0 }, by_customer: [], by_month: [] },
      });
      await settleQueries();
    });
    expect(loadingTiles()).toEqual([]);
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
    await show(BRAND, 'light', <Screen />);
    expect(request).toHaveBeenCalledTimes(1);

    // The shared empty state in its error tone (its icon in the negative text colour), with the retry as its own action.
    expect(iconColors('alert-circle-outline')).toEqual([getTokens(BRAND, 'light').status.negative.text]);
    expect(screen.getAllByRole('button', { name: /try|retry/i }).map(button => button.props.accessibilityLabel)).toEqual(['Try again']);
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);

    // Try again: the request is sent once more, and until its answer the screen is loading,
    // not empty ("No GRNs in this period" would be a wrong answer).
    const second = pending();
    request.mockImplementationOnce(() => second.promise);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(request).toHaveBeenCalledTimes(2);
    expect(iconColors('alert-circle-outline')).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
    expect(loadingTiles().length).toBeGreaterThan(0);
    expect(hasText(emptyTitle)).toBe(false);

    // A second refusal brings the error back.
    await act(async () => {
      second.answer(refused);
      await settleQueries();
    });
    expect(iconColors('alert-circle-outline')).toEqual([getTokens(BRAND, 'light').status.negative.text]);
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    expect(loadingTiles()).toEqual([]);
  });
});

// The reports on the shared layer search through the store, which is a fixed stand-in here:
// their searches, also one that matches nothing, are tested with a real store in
// GRNActivityFlow, DispatchActivityFlow and InvoiceHistoryFlow.test.tsx.
