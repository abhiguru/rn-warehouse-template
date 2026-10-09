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
import SensorsEntry, { SensorsScreen, rowStatus } from '../../../../app/sensors';
import SensorDetailScreen from '../../../../app/sensor-detail/[id]';
import type { SensorDevice } from '@/types/sensor.types';

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
jest.mock('@/hooks/useRoleBasedAccess', () => ({
  useRoleBasedAccess: () => ({ isStaff: true, singleAssignedCustomerId: null, shouldShowListView: true }),
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

async function render(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = {
    theme: { preference: mode, brand },
    auth: { userProfile: { id: 'u1', name: 'Asha', role: 'admin' } },
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  await act(async () => {
    await Promise.resolve();
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
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.fill]));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Operations dashboard', 'GRNs', 'Recent activity', 'A0001']));
    act(() => tree.unmount());
  });

  it('stock summary list', async () => {
    const tree = await render(brand, mode, <StockSummaryScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.surface.field]));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Stock summary', 'Customers with stock', 'Patel Traders']));
    act(() => tree.unmount());
  });

  it('customer activity list', async () => {
    const tree = await render(brand, mode, <CustomerActivityScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.brand.fill]));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Customer activity', 'Patel Traders', '2 GRNs', '1 dispatch']));
    act(() => tree.unmount());
  });

  it('stock aging list with status buckets', async () => {
    const tree = await render(brand, mode, <StockAgingScreen />);
    expect(backgrounds(tree)).toEqual(
      expect.arrayContaining([t.background.base, t.status.positive.element, t.status.negative.element])
    );
    expect(texts(tree)).toEqual(expect.arrayContaining(['Stock aging', '0–120 days', 'Over 364 days', 'Patel Traders']));
    act(() => tree.unmount());
  });

  it('item stock summary with low stock tag', async () => {
    const tree = await render(brand, mode, <ItemStockSummaryScreen />);
    expect(backgrounds(tree)).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.status.critical.background]));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Item stock summary', 'Potato', 'Low stock', '1 GRN']));
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
