/**
 * WH-381 (contract-first, failing until Dev builds WH-381): offline scope cut across screens, reports, forms, GRN
 * details tabs/lot actions, Payments tab, and removed elements (contract product/tech/app-offline-scope-cut.md
 * Sections 4 & 5; Design product/design/offline-capture.md Part 13.1-13.7; spec section H, criteria 14a & 17a).
 *
 * Real: all tested screens, ReportScaffold, useReportQuery, useNeedsConnection, syncStore, syncEngine.isCopyOffline,
 * CustomerAgeStrip, ScreenNeedsConnection, NeedsConnectionLine, GRNTabNavigator, GRNItemsTab, GRNDispatchesTab,
 * GRNInvoicesTab, PaymentsTab, DispatchReviewStep, InvoiceReviewStep, real services, real Redux slices, real i18n.
 * Faked at the edge: Supabase network client (rpc/from/storage), NetInfo / useNetworkStatus, expo-router, native UI
 * modules (FlashList, Reanimated, GestureHandler, SafeArea, Paper, Haptics, ImagePicker, Toast/Alert).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - Fresh offline form open (`dispatch-form-needs-connection`, `invoice-form-needs-connection`): rendered either by
 *    `app/dispatch-form/_layout.tsx` / `app/invoice-form/_layout.tsx` OR by step 1 (`DispatchHeaderStep` /
 *    `InvoiceDetailsStep`). Our test renders the layout with `<Stack>` drawing step 1, so either placement passes.
 *  - `GRNTabNavigator`, `GRNDispatchesTab`, `GRNInvoicesTab`, `GRNItemsTab`: these tests also check each component
 *    directly under `useNeedsConnection() === true` (in addition to `GRNDetailScreen` end-to-end in
 *    `detailsCopyScreens.test.tsx`). If a tab gates offline state in `GRNDetailScreen` instead of inside the tab
 *    component itself, adjust either component or unit expectation at review.
 *  - `PaymentsTab`: already-mounted offline DS1 testID `invoice-details-section-needs-connection-payments` (Design 13.1 B).
 * ==================================
 */
import React from 'react';
import { Text, View } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import OrdersTab from '../../../app/(tabs)/index';
import DispatchTab from '../../../app/(tabs)/dispatch';
import InvoicesTab from '../../../app/(tabs)/invoices';
import CustomerOrderScreen from '../../../app/orders/[customerId]';
import RecentDispatchedScreen from '../../../app/recent-dispatched';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import InvoiceDetailScreen from '../../../app/invoice-details/[id]';
import DispatchActivityScreen from '../../../app/reports/dispatch-activity';
import GRNActivityScreen from '../../../app/reports/grn-activity';
import InvoiceHistoryScreen from '../../../app/reports/invoice-history';
import OperationsDashboardScreen from '../../../app/reports/operations-dashboard';
import AccountantPackScreen from '../../../app/reports/accountant-pack';
import CustomerActivityScreen from '../../../app/reports/customer-activity';
import DispatchFormLayout from '../../../app/dispatch-form/_layout';
import InvoiceFormLayout from '../../../app/invoice-form/_layout';
import { DispatchHeaderStep } from '@/features/dispatch/screens/DispatchHeaderStep';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { InvoiceDetailsStep } from '@/features/invoice/screens/InvoiceDetailsStep';
import { InvoiceReviewStep } from '@/features/invoice/screens/InvoiceReviewStep';
import { ReportScaffold } from '@/components/reports/ReportScaffold';
import type { ReportPhase } from '@/features/reports/useReportQuery';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { GRNTabNavigator } from '@/components/grn-details/GRNTabNavigator';
import { GRNDispatchesTab } from '@/components/grn-details/GRNDispatchesTab';
import { GRNInvoicesTab } from '@/components/grn-details/GRNInvoicesTab';
import { GRNItemsTab, type GRNItem } from '@/components/grn-details/GRNItemsTab';
import { PaymentsTab } from '@/features/payments/PaymentsTab';
import * as engine from '@/features/phone-copy/syncEngine';
import * as syncStore from '@/features/phone-copy/syncStore';
import { setLanguage, t } from '@/i18n';
import { payments as enPayments } from '@/i18n/locales/en/payments';
import { payments as guPayments } from '@/i18n/locales/gu/payments';
import { DISPATCH_ACTIVITY_CUSTOMERS } from '@/features/filters/configs/reports/dispatchActivity';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import { resetScreenFocus } from '@/tests/components/focusHarness';
import { reviewHeader, reviewLine } from '@/tests/helpers/dispatchReviewFixtures';
import { fillNewInvoice, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import { showToast } from '@/utils/toast';
import { showAlert } from '@/utils/alert';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import themeReducer from '@/store/slices/themeSlice';
import dispatchFormReducer, { loadDispatchData as loadDispatchIntoForm } from '@/store/slices/dispatchFormSlice';
import invoiceFormReducer, { updateHeader as updateInvoiceHeader } from '@/store/slices/invoiceFormSlice';

// ---------------------------------------------------------------------------
// Edge stand-ins (network, connectivity, router, native modules)
// ---------------------------------------------------------------------------

const mockRpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let mockRpcHandlers: Record<string, (args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>> = {};
let mockFromHandler: (table: string) => unknown = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () =>
        mockNet.offline
          ? { data: null, error: { message: 'Network request failed' } }
          : { data: { id: 'cust-1', name: 'Fictional Traders', active: true }, error: null },
      single: async () =>
        mockNet.offline
          ? { data: null, error: { message: 'Network request failed' } }
          : { data: { id: 'cust-1', name: 'Fictional Traders', active: true }, error: null },
    }),
  }),
});

const mockNet = {
  offline: false,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    mockNet.listeners.add(listener);
    return () => { mockNet.listeners.delete(listener); };
  },
  set(offline: boolean) {
    mockNet.offline = offline;
    for (const listener of [...mockNet.listeners]) listener();
  },
};

jest.mock('@/hooks/useNetworkStatus', () => {
  const { useSyncExternalStore } = require('react');
  const useOffline = () => useSyncExternalStore(mockNet.subscribe, () => mockNet.offline);
  return { useIsOffline: useOffline, useNetworkStatus: () => ({ isConnected: !useOffline(), type: 'wifi' }) };
});

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: () => () => undefined,
  fetch: async () => ({ type: 'wifi', isConnected: !mockNet.offline, isInternetReachable: !mockNet.offline }),
}));

jest.mock('@/config/supabaseConfig', () => {
  const client = async () => ({
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      mockRpcCalls.push({ name, args });
      if (mockNet.offline) return { data: null, error: { message: 'TypeError: Network request failed', code: 'NETWORK' } };
      const handler = mockRpcHandlers[name];
      if (handler) return handler(args);
      return { data: null, error: { message: `Unhandled RPC ${name}` } };
    },
    from: (table: string) => mockFromHandler(table),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: 'Network request failed' } }) }) },
  });
  return {
    getAuthenticatedClient: client,
    getSupabaseClient: client,
    createAuthenticatedFetch: jest.fn(),
    getCurrentConfig: () => ({ url: 'https://warehouse.example.test', anonKey: 'fictional-key' }),
    getStoredToken: jest.fn(async () => 'fictional-token'),
    RequestTimeoutError: class RequestTimeoutError extends Error {},
  };
});

jest.mock('@/config/lanTransport', () => ({
  getLanStatus: () => ({ state: 'off', url: null }),
  onLanStatusChange: () => () => undefined,
  setLanContext: () => undefined,
  viaCurrentPath: (url: string) => url,
  toCanonicalUrl: (url: string) => url,
}));
jest.mock('@/config/sentryConfig', () => ({
  setSentryUser: jest.fn(),
  clearSentryUser: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

type Role = 'admin' | 'supervisor' | 'staff' | 'customer';
let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store', () => ({ get store() { return mockStore; } }));
jest.mock('react-redux', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useStore: () => mockStore,
    useDispatch: () => mockStore.dispatch,
    useSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('@/store/hooks', () => {
  const { useRef, useSyncExternalStore } = require('react');
  return {
    useAppSelector: (selector: (state: unknown) => unknown) => {
      const last = useRef(null);
      const read = () => {
        const state = mockStore.getState();
        if (!last.current || last.current.state !== state || last.current.selector !== selector) {
          last.current = { state, selector, value: selector(state) };
        }
        return last.current.value;
      };
      return useSyncExternalStore(mockStore.subscribe, read);
    },
    useAppDispatch: () => mockStore.dispatch,
    useAppStore: () => mockStore,
  };
});

let mockParams: Record<string, string> = {};
let mockStackChild: (() => React.ReactNode) | null = null;
jest.mock('expo-router', () => {
  const React = require('react');
  const StackComponent = Object.assign(
    ({ children }: { children?: React.ReactNode }) => (mockStackChild ? mockStackChild() : (children ?? null)),
    {
      Screen: (props: object) => {
        const { StackScreenMock } = require('@/tests/helpers/stackScreenMock');
        return React.createElement(StackScreenMock, props);
      },
    }
  );
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => true,
    useNavigation: () => ({ getParent: () => ({ setOptions: jest.fn() }), setOptions: jest.fn() }),
    Redirect: () => null,
    Stack: StackComponent,
    useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
  };
});

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('react-native-paper', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Badge: 'Badge',
  IconButton: 'IconButton',
  Portal: ({ children }: { children?: React.ReactNode }) => children,
  Snackbar: () => null,
  Surface: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/hooks/useHaptics', () => ({
  triggerLightTap: jest.fn(),
  triggerSelection: jest.fn(),
  triggerMediumTap: jest.fn(),
  triggerSuccess: jest.fn(),
  triggerError: jest.fn(),
  triggerWarning: jest.fn(),
  useHaptics: () => ({ selection: jest.fn(), light: jest.fn(), medium: jest.fn() }),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => false }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: () => {} }));
jest.mock('@/components/ServerAlertBanner', () => ({ ServerAlertBanner: () => null }));
jest.mock('@/features/gst/GstStrip', () => ({ GstStrip: () => null }));
jest.mock('@/features/holding/HeldStrip', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { HeldStrip: () => React.createElement(View, { testID: 'holding-strip' }) };
});
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({ CustomerSearchBottomSheet: () => null }));
jest.mock('@/components/RecentDispatchedOrdersSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ChangeLogBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: () => null }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: ({ children }: { children?: React.ReactNode }) => children }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: () => null }));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: () => null }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: () => null }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image', () => ({ Image: (props: object) => require('react').createElement('ExpoImage', props) }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn(), shareFileBytes: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  unpreparedDispatchPhotos: () => 'ready',
  giveUpDispatchPhotos: jest.fn(),
  generateTempDispatchId: () => 'temp-dispatch-1',
  deleteDispatchImage: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({
  getGRNDetailByNumber: jest.fn(async () => ({ success: true, data: { grn: {}, items: [{ id: 'l1', stock: 40 }] } })),
}));
jest.mock('@/features/dispatch/utils/openDispatchForms', () => ({
  openDispatchFormBlocking: () => null,
  registerDispatchForm: () => () => undefined,
  openDispatchFormCount: () => 0,
}));
jest.mock('@/features/invoice/utils/openInvoiceForms', () => ({
  openFormBlocking: () => null,
  registerInvoiceForm: () => () => undefined,
  openInvoiceFormCount: () => 0,
}));

// ---------------------------------------------------------------------------
// Store, connection & fixture helpers
// ---------------------------------------------------------------------------

const NEEDS_EN = 'This needs a connection. It will load when you reconnect.';
const NEEDS_GU = 'આ માટે કનેક્શન જોઈએ. ફરી જોડાશો ત્યારે લોડ થશે.';

function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      listFilters: listFilterReducer,
      reportPrefs: reportPrefsReducer,
      theme: themeReducer,
      dispatchForm: dispatchFormReducer,
      invoiceForm: invoiceFormReducer,
    },
  });
}

function signIn(role: Role) {
  const customers = role === 'customer' ? [{ id: 'cust-1', name: 'Fictional Traders' }] : [];
  mockStore.dispatch(
    setUserProfile({
      id: 'profile-fictional-1',
      role,
      name: 'Fictional User',
      assignedCustomerIds: customers.map(c => c.id),
      assignedCustomers: customers,
      assignedCustomersStatus: 'loaded',
    } as never)
  );
}

/** Cold-start offline with copy unopened (WH-328 case (b)): feature 'on', phase 'empty', format undefined, copyOpen false. */
function coldStartOffline(role: Role = 'admin') {
  signIn(role);
  syncStore.resetSyncSnapshot({
    feature: 'on',
    phase: 'empty',
    format: undefined,
    kind: role === 'customer' ? 'customer' : 'warehouse',
    asOf: null,
    current: false,
    pending: false,
    copyOpen: false,
  });
  engine.setCopyOffline(true);
  mockNet.set(true);
}

/** Ready copy online (visited online first, then `setOffline(true)` drops connection). */
function startOnlineWithCopy(role: Role = 'admin') {
  signIn(role);
  syncStore.resetSyncSnapshot({
    feature: 'on',
    phase: 'ready',
    format: 8,
    kind: role === 'customer' ? 'customer' : 'warehouse',
    asOf: '2026-11-25T05:12:00.000+00:00',
    current: true,
    pending: false,
    copyOpen: true,
  });
  engine.setCopyOffline(false);
  mockNet.set(false);
}

async function setOffline(offline: boolean) {
  await act(async () => {
    engine.setCopyOffline(offline);
    mockNet.set(offline);
    syncStore.updateSyncSnapshot({ current: !offline });
  });
}

function installOnlineRpcFixtures() {
  mockRpcHandlers = {
    get_orders_list: async () => ({
      data: {
        success: true,
        data: [
          {
            id: 'order-1',
            order_no: 'ORD-101',
            customer_id: 'cust-1',
            customer: { id: 'cust-1', name: 'Fictional Traders' },
            status: 'OPEN',
            item_count: 1,
            quantity_sum: 12,
            updated_at: '2026-11-25T08:00:00Z',
          },
        ],
        metadata: { has_more: false, total_count: 1 },
      },
      error: null,
    }),
    get_customer_order: async () => ({
      data: { exists: true, order_id: 'order-1', order_no: 'ORD-101', item_count: 1 },
      error: null,
    }),
    get_order_with_items: async () => ({
      data: {
        success: true,
        data: {
          order_data: {
            id: 'order-1',
            order_no: 'ORD-101',
            customer_id: 'cust-1',
            customer_name: 'Fictional Traders',
            status: 'OPEN',
            item_count: 1,
            quantity_sum: 12,
            updated_at: '2026-11-25T08:00:00Z',
          },
          items: [
            {
              id: 'oline-1',
              order_id: 'order-1',
              grn_items_id: 'lot-1',
              grn_items_item_name: 'Fictional Peas',
              grn_items_packaging: 'Bag',
              grn_items_package_mark: 'PM-1',
              current_stock: 40,
              grn_items_qty: 50,
              grn_items_rack: 'A-1',
              grn_items_weight: 50,
              grns_id: 'grn-1',
              grns_gr_no: 'GR-101',
              grns_date: '2026-11-20',
              requested_quantity: 12,
              fulfilled_quantity: 0,
              item_status: 'PENDING',
              created_at: '2026-11-25T08:00:00Z',
              updated_at: '2026-11-25T08:00:00Z',
            },
          ],
        },
      },
      error: null,
    }),
    get_recent_dispatched_orders: async () => ({
      data: {
        success: true,
        data: {
          dispatches: [
            {
              dispatch_id: 'disp-1',
              disp_no: 'DISP-201',
              disp_date: '2026-11-25T08:00:00Z',
              customer_id: 'cust-1',
              customer_name: 'Fictional Traders',
              total_qty: 10,
              item_count: 1,
              source_order_id: 'order-1',
              source_order_no: 'ORD-101',
            },
          ],
          total_count: 1,
          has_more: false,
        },
      },
      error: null,
    }),
    get_dispatch_list_with_items: async () => ({
      data: {
        success: true,
        data: {
          dispatches: [
            {
              id: 'disp-1',
              disp_no: 'DISP-201',
              dispatch_date: '2026-11-25',
              customer_id: 'cust-1',
              customer_name: 'Fictional Traders',
              total_qty: 10,
              items: [],
            },
          ],
          total_count: 1,
          current_page: 1,
          total_pages: 1,
          limit: 20,
        },
      },
      error: null,
    }),
    get_dispatch_details: async () => ({
      data: {
        success: true,
        data: {
          dispatch: {
            id: 'disp-1',
            disp_no: 'DISP-201',
            disp_date: '2026-11-25T08:00:00Z',
            customer_id: 'cust-1',
            customer_details: { id: 'cust-1', name: 'Fictional Traders' },
            note: 'Online dispatch note',
            items: [
              {
                id: 'dline-1',
                gr_trl_id: 'lot-1',
                grn_item_id: 'lot-1',
                item_name: 'Fictional Peas',
                disp_quantity: 10,
                packaging: 'Bag',
              },
            ],
            images: [],
            invoices_summary: { total_invoices: 0, invoices: [] },
          },
        },
      },
      error: null,
    }),
    get_invoices_list: async () => ({
      data: {
        success: true,
        data: {
          invoices: [
            {
              id: 'inv-1',
              inv_no: 8001,
              inv_label: 'INV-8001',
              inv_date: '2026-11-25',
              customer_id: 'cust-1',
              customer_name: 'Fictional Traders',
              total: 4200,
              item_count: 1,
            },
          ],
          total_count: 1,
          current_page: 1,
          total_pages: 1,
          limit: 20,
        },
      },
      error: null,
    }),
    get_invoice_data: async () => ({
      data: {
        success: true,
        data: {
          header: {
            id: 'inv-1',
            invoice_no: 8001,
            inv_no: 8001,
            inv_prefix: 'INV-',
            invoice_date: '2026-11-25',
            inv_date: '2026-11-25',
            inv_fin_year: '2026-27',
            customer_id: 'cust-1',
            customer_name: 'Fictional Traders',
            customer: { id: 'cust-1', name: 'Fictional Traders' },
            gr_id: 'grn-1',
            gr_no: 'GR-101',
            grn: { id: 'grn-1', number: 'GR-101' },
            total: 4200,
            subtotal: 4200,
            discount: 0,
            tax_amount: 0,
            labour: 0,
            labour_amount: 0,
            round_off: 0,
          },
          items: [
            {
              id: 'invline-1',
              item_name: 'Fictional Peas',
              qty: 10,
              rate: 420,
              amount: 4200,
              packaging: 'Bag',
            },
          ],
        },
      },
      error: null,
    }),
    get_invoice_items_detailed: async () => ({ data: { success: true, data: { items: [], summary: null } }, error: null }),
    get_invoice_detail: async () => ({
      data: {
        success: true,
        invoice: {
          payment_status: 'part_paid',
          paid_amount: 1000,
          due_amount: 3200,
          payments: [
            {
              id: 'pay-1',
              payment_no: 1,
              invoice_id: 'inv-1',
              paid_on: '2026-11-25',
              amount: 1000,
              mode: 'cash',
              note: 'Part payment',
              updated_at: '2026-11-25T08:00:00Z',
              recorded_in_app: true,
              imported: false,
            },
          ],
        },
      },
      error: null,
    }),
    get_all_dispatch_activity: async () => ({
      data: {
        summary: { total_dispatches: 2, total_customers: 1, total_quantity: 25 },
        by_customer: [{ customer_id: 'cust-1', customer_name: 'Fictional Traders', dispatch_count: 2, total_quantity: 25 }],
      },
      error: null,
    }),
    get_all_grn_activity: async () => ({
      data: {
        success: true,
        data: {
          summary: { total_grns: 3, total_quantity: 90 },
          by_customer: [{ customer_id: 'cust-1', customer_name: 'Fictional Traders', grn_count: 3, total_quantity: 90, latest_grn_date: '2026-11-25' }],
        },
      },
      error: null,
    }),
    get_customer_invoice_summary: async () => ({
      data: {
        success: true,
        data: {
          summary: { total_invoices: 1, total_amount: 4200 },
          by_customer: [{ customer_id: 'cust-1', customer_name: 'Fictional Traders', invoice_count: 1, total_amount: 4200, latest_invoice_date: '2026-11-25' }],
        },
      },
      error: null,
    }),
    get_operations_dashboard: async () => ({
      data: {
        kpis: { total_grns: 3, total_dispatches: 2, pending_orders: 1, active_customers: 4, total_stock_qty: 120 },
        trends: { grn_daily: [{ date: '2026-11-25', count: 3 }], dispatch_daily: [{ date: '2026-11-25', count: 2 }] },
        recent_activity: [{ type: 'dispatch', ref: 'DISP-201', customer: 'Fictional Traders', time: '2026-11-25T08:00:00Z' }],
      },
      error: null,
    }),
    get_all_customer_activity_summary: async () => ({
      data: {
        success: true,
        data: {
          summary: { total_customers: 1, total_current_stock: 120 },
          customers: [
            {
              customer_id: 'cust-1',
              customer_name: 'Fictional Traders',
              grn_count: 3,
              dispatch_count: 2,
              invoice_count: 1,
              current_stock: 120,
              last_activity_at: '2026-11-25T08:00:00Z',
            },
          ],
        },
      },
      error: null,
    }),
  };
}

let restoreQueries: () => void;
let consoleErrorSpy: jest.Spied<typeof console.error>;

beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());

beforeEach(async () => {
  jest.clearAllMocks();
  for (const level of ['log', 'info', 'warn', 'debug', 'time', 'timeEnd'] as const) {
    jest.spyOn(console, level).mockImplementation(() => undefined);
  }
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockRpcCalls.length = 0;
  mockParams = {};
  mockStackChild = null;
  mockNet.offline = false;
  engine.setCopyOffline(false);
  syncStore.resetSyncSnapshot();
  forgetQueries();
  resetScreenFocus();
  mockStore = makeStore();
  installOnlineRpcFixtures();
});

afterEach(async () => {
  engine.setCopyOffline(false);
  syncStore.resetSyncSnapshot();
  await AsyncStorage.clear();
  await setLanguage('en');
  jest.restoreAllMocks();
});

const expectCleanNeedsConnection = async (testID: string, text: string = NEEDS_EN) => {
  expect(await screen.findByTestId(testID)).toHaveTextContent(text);
  expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
  expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('holding-strip')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('orders-new-needs-connection')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('queue-dispatch-needs-connection')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('invoices-new-needs-connection')).not.toBeOnTheScreen();
  expect(consoleErrorSpy).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
  expect(showAlert).not.toHaveBeenCalled();
};

// ===========================================================================
// 1. Cold-start offline with copy unopened [WH-328 case (b)] — all screens
// ===========================================================================

describe('WH-381 Section 4.1: cold-start offline with copy unopened [WH-328 case (b)]', () => {
  const COLD_START_SCREENS: ReadonlyArray<[string, React.ComponentType, Record<string, string>, string, Role]> = [
    ['Orders tab (admin)', OrdersTab, {}, 'orders-needs-connection', 'admin'],
    ['Orders tab (staff)', OrdersTab, {}, 'orders-needs-connection', 'staff'],
    ['Orders tab (supervisor)', OrdersTab, {}, 'orders-needs-connection', 'supervisor'],
    ['Orders tab (customer)', OrdersTab, {}, 'orders-needs-connection', 'customer'],
    ['Order details', CustomerOrderScreen, { customerId: 'cust-1' }, 'order-details-needs-connection', 'admin'],
    ['Recently dispatched', RecentDispatchedScreen, {}, 'recent-dispatched-needs-connection', 'supervisor'],
    ['Dispatch tab (staff)', DispatchTab, {}, 'dispatch-needs-connection', 'staff'],
    ['Dispatch tab (admin)', DispatchTab, {}, 'dispatch-needs-connection', 'admin'],
    ['Dispatch details', DispatchDetailScreen, { id: 'disp-1' }, 'dispatch-details-needs-connection', 'admin'],
    ['Invoices tab (admin)', InvoicesTab, {}, 'invoices-needs-connection', 'admin'],
    ['Invoices tab (customer)', InvoicesTab, {}, 'invoices-needs-connection', 'customer'],
    ['Invoice details', InvoiceDetailScreen, { id: 'inv-1' }, 'invoice-details-needs-connection', 'admin'],
    ['Dispatch activity report', DispatchActivityScreen, {}, 'dispatch-activity-needs-connection', 'admin'],
    ['GRN activity report', GRNActivityScreen, {}, 'grn-activity-needs-connection', 'admin'],
    ['Invoice history report', InvoiceHistoryScreen, {}, 'invoice-history-needs-connection', 'admin'],
    ['Operations dashboard', OperationsDashboardScreen, {}, 'operations-dashboard-needs-connection', 'admin'],
    ['Accountant pack', AccountantPackScreen, {}, 'accountant-pack-needs-connection', 'admin'],
    ['Customer activity (admin, Q1)', CustomerActivityScreen, {}, 'customer-activity-needs-connection', 'admin'],
    ['Customer activity (supervisor, Q1)', CustomerActivityScreen, {}, 'customer-activity-needs-connection', 'supervisor'],
    ['Customer activity (staff, Q1)', CustomerActivityScreen, {}, 'customer-activity-needs-connection', 'staff'],
  ];

  it.each(COLD_START_SCREENS)(
    '%s: immediate ScreenNeedsConnection with zero RPC calls, zero console.error, zero toast/alert and no Try again',
    async (_name, Screen, params, testID, role) => {
      coldStartOffline(role);
      mockParams = params;
      await render(<Screen />);
      await expectCleanNeedsConnection(testID);
      expect(mockRpcCalls).toEqual([]);
    }
  );

  it('Orders tab -> Queue switch (warehouse role) on cold-start offline shows order-queue-needs-connection with switch preserved', async () => {
    coldStartOffline('supervisor');
    await render(<OrdersTab />);
    await expectCleanNeedsConnection('orders-needs-connection');
    await userEvent.press(screen.getByText('Queue'));
    await expectCleanNeedsConnection('order-queue-needs-connection');
    expect(mockRpcCalls).toEqual([]);
  });

  it.each([
    ['Orders tab', OrdersTab, 'orders-needs-connection'],
    ['Dispatch tab', DispatchTab, 'dispatch-needs-connection'],
    ['Invoices tab', InvoicesTab, 'invoices-needs-connection'],
    ['Dispatch activity', DispatchActivityScreen, 'dispatch-activity-needs-connection'],
    ['Accountant pack', AccountantPackScreen, 'accountant-pack-needs-connection'],
  ] as const)('Gujarati cold-start offline: %s shows Gujarati ScreenNeedsConnection wording', async (_name, Screen, testID) => {
    await setLanguage('gu');
    coldStartOffline('admin');
    await render(<Screen />);
    await expectCleanNeedsConnection(testID, NEEDS_GU);
  });
});

// ===========================================================================
// 2. Visited online -> connection drops -> ZERO kept rows -> reconnect clears
// ===========================================================================

describe('WH-381 Section 4.1 & 4.4: visited online then connection drops (ZERO kept rows, auto-reconnect)', () => {
  it('Dispatch tab: no HeldStrip or CustomerAgeStrip online; drops to dispatch-needs-connection with zero rows and no FAB; reconnects', async () => {
    startOnlineWithCopy('admin');
    await render(<DispatchTab />);
    expect(await screen.findByText(/DISP-201/)).toBeOnTheScreen();
    expect(screen.getByTestId('create-dispatch-fab')).toBeOnTheScreen();
    expect(screen.queryByTestId('holding-strip')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();

    await setOffline(true);
    await expectCleanNeedsConnection('dispatch-needs-connection');
    expect(screen.queryByText(/DISP-201/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('create-dispatch-fab')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-last-updated')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-stale-strip')).not.toBeOnTheScreen();

    await setOffline(false);
    expect(await screen.findByText(/DISP-201/)).toBeOnTheScreen();
    expect(screen.queryByTestId('dispatch-needs-connection')).not.toBeOnTheScreen();
  });

  it('Order details: hides History and + buttons and drops kept order lines offline; reloads automatically on reconnect', async () => {
    startOnlineWithCopy('admin');
    mockParams = { customerId: 'cust-1' };
    await render(<CustomerOrderScreen />);
    expect(await screen.findByText('Fictional Peas')).toBeOnTheScreen();
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();

    await setOffline(true);
    await expectCleanNeedsConnection('order-details-needs-connection');
    expect(screen.queryByText('Fictional Peas')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('order-screen-history')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('order-screen-add')).not.toBeOnTheScreen();

    await setOffline(false);
    expect(await screen.findByText('Fictional Peas')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-details-needs-connection')).not.toBeOnTheScreen();
  });

  it('Recently dispatched: drops kept cards offline and reloads automatically on reconnect', async () => {
    startOnlineWithCopy('supervisor');
    await render(<RecentDispatchedScreen />);
    expect(await screen.findByText(/DISP-201/)).toBeOnTheScreen();

    await setOffline(true);
    await expectCleanNeedsConnection('recent-dispatched-needs-connection');
    expect(screen.queryByText(/DISP-201/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('recent-dispatched-retry')).not.toBeOnTheScreen();

    await setOffline(false);
    expect(await screen.findByText(/DISP-201/)).toBeOnTheScreen();
    expect(screen.queryByTestId('recent-dispatched-needs-connection')).not.toBeOnTheScreen();
  });

  it('Invoice details: drops kept invoice offline and reloads automatically on reconnect', async () => {
    startOnlineWithCopy('admin');
    mockParams = { id: 'inv-1' };
    await render(<InvoiceDetailScreen />);
    expect(await screen.findByText(/Fictional Traders/)).toBeOnTheScreen();
    expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();

    await setOffline(true);
    await expectCleanNeedsConnection('invoice-details-needs-connection');
    expect(screen.queryByText(/Fictional Traders/)).not.toBeOnTheScreen();

    await setOffline(false);
    expect(await screen.findByText(/Fictional Traders/)).toBeOnTheScreen();
    expect(screen.queryByTestId('invoice-details-needs-connection')).not.toBeOnTheScreen();
  });

  it.each([
    ['Dispatch activity', DispatchActivityScreen, 'dispatch-activity-needs-connection', 'Fictional Traders'],
    ['GRN activity', GRNActivityScreen, 'grn-activity-needs-connection', 'Fictional Traders'],
    ['Invoice history', InvoiceHistoryScreen, 'invoice-history-needs-connection', 'Fictional Traders'],
    ['Operations dashboard', OperationsDashboardScreen, 'operations-dashboard-needs-connection', 'DISP-201'],
    ['Customer activity (admin, Q1)', CustomerActivityScreen, 'customer-activity-needs-connection', 'Fictional Traders'],
  ] as const)(
    '%s: visited online then connection drops -> ZERO kept rows, no Try again, clears on reconnect',
    async (_name, Screen, testID, onlineRowText) => {
      startOnlineWithCopy('admin');
      await render(<Screen />);
      expect(await screen.findByText(new RegExp(onlineRowText))).toBeOnTheScreen();

      await setOffline(true);
      await expectCleanNeedsConnection(testID);
      expect(screen.queryByText(new RegExp(onlineRowText))).not.toBeOnTheScreen();

      await setOffline(false);
      expect(await screen.findByText(new RegExp(onlineRowText))).toBeOnTheScreen();
      expect(screen.queryByTestId(testID)).not.toBeOnTheScreen();
    }
  );

  it('Accountant pack: hides date pickers and Make pack button offline, restores on reconnect', async () => {
    startOnlineWithCopy('admin');
    await render(<AccountantPackScreen />);
    expect(screen.getByTestId('accountant-pack-make')).toBeOnTheScreen();
    expect(screen.getByTestId('accountant-pack-from')).toBeOnTheScreen();

    await setOffline(true);
    await expectCleanNeedsConnection('accountant-pack-needs-connection');
    expect(screen.queryByTestId('accountant-pack-make')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('accountant-pack-from')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('accountant-pack-to')).not.toBeOnTheScreen();

    await setOffline(false);
    expect(await screen.findByTestId('accountant-pack-make')).toBeOnTheScreen();
    expect(screen.queryByTestId('accountant-pack-needs-connection')).not.toBeOnTheScreen();
  });
});

// ===========================================================================
// 3. ReportScaffold offline across EVERY phase (including 'stale' & 'ready')
// ===========================================================================

describe('WH-381 Section 4.4: ReportScaffold offline hides kept rows regardless of phase', () => {
  const PHASES: ReadonlyArray<[string, ReportPhase, string | null, boolean]> = [
    ['loading', 'loading', null, false],
    ['error', 'error', 'Network request failed', false],
    ['ready with stale kept rows & error', 'ready', 'Network request failed', true],
    ['stale (literal phase)', 'stale' as unknown as ReportPhase, 'Network request failed', true],
  ];

  it.each(PHASES)(
    'phase=%s: renders ONLY ReportHeader (no export icons) + ScreenNeedsConnection, zero kept rows, zero KPIs, no search/filters, no CustomerAgeStrip',
    async (_label, phase, error, isKeptCopy) => {
      startOnlineWithCopy('customer');
      await setOffline(true);

      function Harness() {
        const filters = useReportFilters(DISPATCH_ACTIVITY_CUSTOMERS);
        return (
          <ReportScaffold
            reportId="dispatch-activity"
            title="Dispatch activity"
            subtitle="All customers"
            needsConnectionId="dispatch-activity-needs-connection"
            actions={[{ icon: 'share-variant', label: 'Share PDF', onPress: jest.fn() }]}
            filters={{ config: DISPATCH_ACTIVITY_CUSTOMERS, state: filters }}
            query={{
              phase,
              isRefreshing: false,
              isFetching: false,
              error,
              refresh: async () => false,
              retry: jest.fn(),
              updatedAt: Date.now(),
              isKeptCopy,
            }}
            kpis={[{ icon: 'truck-delivery-outline', value: 42, label: 'Dispatches', variant: 'primary' }]}
            rows={[{ id: 'kept-row-1', name: 'Kept Fictional Row' }]}
            renderRow={(row) => <Text testID="kept-report-row">{row.name}</Text>}
            keyExtractor={(row) => row.id}
            noun="customers"
            empty={{ icon: 'truck-delivery-outline', title: 'Empty' }}
          />
        );
      }

      await render(<Harness />);

      expect(screen.getByText('Dispatch activity')).toBeOnTheScreen();
      expect(screen.getByText('All customers')).toBeOnTheScreen();
      expect(screen.getByTestId('dispatch-activity-needs-connection')).toHaveTextContent(NEEDS_EN);
      expect(screen.queryByTestId('kept-report-row')).not.toBeOnTheScreen();
      expect(screen.queryByText('Kept Fictional Row')).not.toBeOnTheScreen();
      expect(screen.queryByText('42')).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /Share PDF/i })).not.toBeOnTheScreen();
      expect(screen.queryByPlaceholderText(DISPATCH_ACTIVITY_CUSTOMERS.search!.placeholder)).not.toBeOnTheScreen();
      expect(screen.queryByTestId('customer-age-strip')).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    }
  );
});

// ===========================================================================
// 4. Forms: fresh offline open vs already-open connection drop
// ===========================================================================

describe('WH-381 Section 4.1 & 4.2: Dispatch and Invoice forms offline (Design Part 13.1 A & B)', () => {
  it('fresh offline open of Dispatch form shows dispatch-form-needs-connection with no fields or submit', async () => {
    coldStartOffline('admin');
    mockStackChild = () => <DispatchHeaderStep mode="create" />;
    await render(<DispatchFormLayout />);
    await expectCleanNeedsConnection('dispatch-form-needs-connection');
    expect(screen.queryByLabelText('Dispatch number')).not.toBeOnTheScreen();
  });

  it('fresh offline open of Invoice form shows invoice-form-needs-connection with no fields or submit', async () => {
    coldStartOffline('admin');
    mockStackChild = () => <InvoiceDetailsStep mode="create" />;
    await render(<InvoiceFormLayout />);
    await expectCleanNeedsConnection('invoice-form-needs-connection');
    expect(screen.queryByLabelText(/Invoice number/i)).not.toBeOnTheScreen();
  });

  it('already-open Dispatch form when connection drops: keeps typed fields, disables submit, shows dispatch-form-bottom-bar-needs-connection, re-enables on reconnect', async () => {
    startOnlineWithCopy('admin');
    mockStore.dispatch(
      loadDispatchIntoForm({
        dispatchId: 'new',
        header: { ...reviewHeader, disp_no: 'D-999', supervisor_id: 'sup-fictional-1' },
        items: [reviewLine(1)],
        images: [],
      })
    );
    await render(<DispatchReviewStep mode="create" />);
    const submitOnline = await screen.findByRole('button', { name: /Create dispatch/i });
    expect(submitOnline).toBeEnabled();
    expect(screen.queryByTestId('dispatch-form-bottom-bar-needs-connection')).not.toBeOnTheScreen();

    await setOffline(true);
    expect(screen.getByText(/Fictional/i)).toBeOnTheScreen();
    expect(await screen.findByTestId('dispatch-form-bottom-bar-needs-connection')).toHaveTextContent('Needs a connection');
    const submitOffline = screen.getByRole('button', { name: /Create dispatch, needs a connection/i });
    expect(submitOffline).toBeDisabled();
    expect(screen.queryByTestId('dispatch-form-needs-connection')).not.toBeOnTheScreen();

    await setOffline(false);
    expect(await screen.findByRole('button', { name: /^Create dispatch$/i })).toBeEnabled();
    expect(screen.queryByTestId('dispatch-form-bottom-bar-needs-connection')).not.toBeOnTheScreen();
  });

  it('already-open Invoice form when connection drops: keeps typed fields, disables submit, shows invoice-form-bottom-bar-needs-connection, re-enables on reconnect', async () => {
    startOnlineWithCopy('admin');
    fillNewInvoice(mockStore as never, [invoiceLine()]);
    mockStore.dispatch(updateInvoiceHeader({ inv_no: 8099, inv_date: '2026-11-25', inv_fin_year: '2026-27', inv_no_typed: true }));
    await render(<InvoiceReviewStep mode="create" />);
    const submitOnline = await screen.findByRole('button', { name: /Create invoice/i });
    expect(submitOnline).toBeEnabled();
    expect(screen.queryByTestId('invoice-form-bottom-bar-needs-connection')).not.toBeOnTheScreen();

    await setOffline(true);
    expect(await screen.findByTestId('invoice-form-bottom-bar-needs-connection')).toHaveTextContent('Needs a connection');
    const submitOffline = screen.getByRole('button', { name: /Create invoice, needs a connection/i });
    expect(submitOffline).toBeDisabled();
    expect(screen.queryByTestId('invoice-form-needs-connection')).not.toBeOnTheScreen();

    await setOffline(false);
    expect(await screen.findByRole('button', { name: /^Create invoice$/i })).toBeEnabled();
    expect(screen.queryByTestId('invoice-form-bottom-bar-needs-connection')).not.toBeOnTheScreen();
  });
});

// ===========================================================================
// 5. GRN details tabs/lot & PaymentsTab offline (Design Part 13.1 B)
// ===========================================================================

describe('WH-381 Section 4.2: GRN details tabs, expanded lot and already-mounted PaymentsTab offline (Part 13.1 B)', () => {
  const lot: GRNItem = {
    id: 'lot-fictional-1',
    item_name: 'Fictional Peas',
    qty: 100,
    stock: 60,
    packaging: 'Bag',
    rack: 'A-1',
    package_mark: 'PM-1',
    dispatch_summary: { total_dispatched: 40, dispatch_count: 2 },
  };

  it('GRNTabNavigator offline: omits dispatch_count and invoice_count badges while keeping both tabs selectable', async () => {
    startOnlineWithCopy('staff');
    await setOffline(true);
    const onTabChange = jest.fn();
    await render(
      <GRNTabNavigator
        activeTab="items"
        onTabChange={onTabChange}
        item_count={2}
        dispatch_count={4}
        image_count={3}
        invoice_count={2}
      />
    );
    expect(screen.getByRole('tab', { name: 'Items, 2' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Images, 3' })).toBeOnTheScreen();
    const dispatchesTab = screen.getByRole('tab', { name: 'Dispatches' });
    const invoicesTab = screen.getByRole('tab', { name: 'Invoices' });
    expect(screen.queryByRole('tab', { name: /^Dispatches, / })).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: /^Invoices, / })).not.toBeOnTheScreen();
    await userEvent.press(dispatchesTab);
    expect(onTabChange).toHaveBeenCalledWith('dispatches');
    await userEvent.press(invoicesTab);
    expect(onTabChange).toHaveBeenCalledWith('invoices');
  });

  it('GRNDispatchesTab offline: DS1 grn-details-section-needs-connection-dispatches, no rows, no Retry', async () => {
    startOnlineWithCopy('staff');
    await setOffline(true);
    await render(
      <GRNDispatchesTab
        items={[lot]}
        dispatchesByItem={{
          'lot-fictional-1': [
            {
              id: 'dt-1',
              dispatch_id: 'disp-1',
              disp_no: 'DISP-201',
              disp_date: '2026-11-25',
              disp_quantity: 40,
              customer_name: 'Fictional Traders',
              registration: 'GJ01AA0001',
              supervisor_name: 'Meera Fictional',
            },
          ],
        }}
        error="Network error"
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByTestId('grn-details-section-needs-connection-dispatches')).toHaveTextContent(NEEDS_EN);
    expect(screen.queryByTestId('grn-dispatches-table')).not.toBeOnTheScreen();
    expect(screen.queryByText('DISP-201')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
  });

  it('GRNInvoicesTab offline: DS1 grn-details-section-needs-connection-invoices, no grn-invoice-state, no grn-create-invoice', async () => {
    startOnlineWithCopy('admin');
    await setOffline(true);
    await render(
      <GRNInvoicesTab
        invoices={{
          rows: [{ key: 'inv-1', invoice_id: 'inv-1', invoice_no: 8001, invoice_label: 'INV-8001', invoice_date: '2026-11-25', total: 4200 }],
          total: 4200,
          count: 1,
          detailed: true,
        }}
        state="partly_invoiced"
        onCreateInvoice={jest.fn()}
      />
    );
    expect(screen.getByTestId('grn-details-section-needs-connection-invoices')).toHaveTextContent(NEEDS_EN);
    expect(screen.queryByTestId('grn-invoice-state')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('grn-create-invoice')).not.toBeOnTheScreen();
    expect(screen.queryByText('INV-8001')).not.toBeOnTheScreen();
  });

  it('GRNItemsTab expanded lot offline: View dispatches disabled with ", needs a connection" + footnote, Change rack or mark stays enabled (en & gu)', async () => {
    startOnlineWithCopy('staff');
    await setOffline(true);
    const onViewDispatches = jest.fn();
    const onQuickChange = jest.fn();
    await render(<GRNItemsTab items={[lot]} onViewItemDispatches={onViewDispatches} onQuickChange={onQuickChange} grnNumber="GR-101" />);
    await userEvent.press(screen.getByTestId('grn-item-row-lot-fictional-1'));

    const btn = screen.getByTestId('grn-item-dispatches-lot-fictional-1');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleName('View dispatches, needs a connection');
    expect(screen.getByTestId('grn-item-dispatches-needs-connection-lot-fictional-1')).toHaveTextContent('Needs a connection');
    await userEvent.press(btn);
    expect(onViewDispatches).not.toHaveBeenCalled();

    const quickChange = screen.getByTestId('grn-lot-quick-change-lot-fictional-1');
    expect(quickChange).toBeEnabled();
    await userEvent.press(quickChange);
    expect(onQuickChange).toHaveBeenCalledTimes(1);
  });

  it('PaymentsTab already mounted when connection drops: DS1 invoice-details-section-needs-connection-payments, no rows, no Record payment', async () => {
    startOnlineWithCopy('admin');
    await render(<PaymentsTab invoiceId="inv-1" invoiceNumber="INV-8001" total={4200} cancelled={false} canManage />);
    expect(await screen.findByTestId('payments-summary')).toBeOnTheScreen();

    await setOffline(true);
    expect(await screen.findByTestId('invoice-details-section-needs-connection-payments')).toHaveTextContent(NEEDS_EN);
    expect(screen.queryByTestId('payments-summary')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Record payment/i })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('payments-new-needs-connection')).not.toBeOnTheScreen();
  });

  it('PaymentsTab opened offline: loads nothing (no server call, no raw error), shows the DS1 line in English and Gujarati, and loads on reconnect', async () => {
    coldStartOffline('admin');
    await render(<PaymentsTab invoiceId="inv-1" invoiceNumber="INV-8001" total={4200} cancelled={false} canManage />);
    expect(await screen.findByTestId('invoice-details-section-needs-connection-payments')).toHaveTextContent(NEEDS_EN);
    expect(mockRpcCalls).toEqual([]);
    expect(screen.queryByTestId('payments-summary')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Record payment/i })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeOnTheScreen();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();

    await setOffline(false);
    expect(await screen.findByTestId('payments-summary')).toBeOnTheScreen();
    expect(screen.queryByTestId('invoice-details-section-needs-connection-payments')).not.toBeOnTheScreen();
    expect(mockRpcCalls.length).toBeGreaterThan(0);
  });

  it('PaymentsTab opened offline, Gujarati: the DS1 line says the Part 13.3 words', async () => {
    await setLanguage('gu');
    coldStartOffline('admin');
    await render(<PaymentsTab invoiceId="inv-1" invoiceNumber="INV-8001" total={4200} cancelled={false} canManage />);
    expect(await screen.findByTestId('invoice-details-section-needs-connection-payments')).toHaveTextContent(NEEDS_GU);
    expect(mockRpcCalls).toEqual([]);
  });
});

// ===========================================================================
// 6. Removed i18n keys & Part 13.3 GRN Invoicing filter wording
// ===========================================================================

describe('WH-381 Section 4.3 & Design Part 13.3: removed i18n keys and updated wording', () => {
  it('payments.offline.newNeedsConnection is removed in English and Gujarati', () => {
    const enOffline = (enPayments as Record<string, unknown>).offline as Record<string, unknown> | undefined;
    const guOffline = (guPayments as Record<string, unknown>).offline as Record<string, unknown> | undefined;
    expect(enOffline?.newNeedsConnection).toBeUndefined();
    expect(guOffline?.newNeedsConnection).toBeUndefined();
  });

  it('GRN Invoicing filter offline strings match Design Part 13.3 in English and Gujarati and never say "They load when you reconnect."', async () => {
    await setLanguage('en');
    expect(t('grn.offline.invoicingWaitTitle')).toBe('Filtering by invoicing needs a connection');
    expect(t('grn.offline.invoicingWaitMessage')).toBe('Clear the filter to see GRNs offline.');
    expect(t('grn.offline.invoicingWaitMessage')).not.toContain('They load when you reconnect.');

    await setLanguage('gu');
    expect(t('grn.offline.invoicingWaitTitle')).toBe('ઇન્વૉઇસ પ્રમાણે ફિલ્ટર કરવા કનેક્શન જોઈએ');
    expect(t('grn.offline.invoicingWaitMessage')).toBe('ઑફલાઇન આવક પાવતી જોવા ફિલ્ટર સાફ કરો.');
  });
});
