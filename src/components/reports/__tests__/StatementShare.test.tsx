/**
 * WH-221: the customer statement's header offers the shared "Share PDF" (reports.export.sharePdf, the file-pdf-box icon of
 * exportHeaderActions), once the figures are on screen, and pressing it makes the statement's PDF and shares it.
 * Only the services, the router and the sharing sheet are stand-ins.
 */
import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import { generateStatementPDF } from '@/services/pdf-service';
import { getCustomerStatement } from '@/services/reporting/statement-service';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import StatementScreen from '../../../../app/reports/statement';

let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => {
  const { useRef, useSyncExternalStore } = jest.requireActual('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
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
  };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ customerId: 'c2' }),
  Redirect: () => null,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Riverside', companyName: 'Riverside Cold Storage' }),
  onOperatorServerChange: () => () => {},
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateStatementPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});
jest.mock('@/services/reporting/statement-service', () => ({ getCustomerStatement: jest.fn() }));

const makeStore = () =>
  configureStore({
    reducer: {
      auth: (state: unknown = { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } }) => state,
      theme: (state = { preference: 'light', brand: 'orange' }) => state,
      listFilters: listFilterReducer,
      reportPrefs: reportPrefsReducer,
    },
  });

const STATEMENT = {
  as_of: '2026-10-12T10:00:00Z',
  customer: { id: 'c2', name: 'Green Valley Traders', active: true },
  record_payments: false,
  invoices_basis: 'all',
  figures: { invoices_amount: 1000, not_invoiced_left: 0, not_invoiced_in_store: 0 },
  lots_without_rate: 0,
  unlinked_paid_amount: null,
  left: [],
  in_store: [],
  invoices: [],
};

jest.setTimeout(30_000);

let restoreQueries: () => void;
beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());
beforeEach(() => {
  jest.clearAllMocks();
  forgetQueries();
  mockStore = makeStore();
  jest.mocked(getCustomerStatement).mockResolvedValue({ success: true, message: '', data: STATEMENT } as never);
  jest.mocked(generateStatementPDF).mockResolvedValue({ success: true, pdfUrl: 'https://warehouse.example.test/s.pdf' } as never);
  jest.mocked(downloadAndSharePDF).mockResolvedValue({ success: true } as never);
});

/** The `name` prop of every host element: nothing else finds the mocked icons by their glyph. */
type JsonNode = NonNullable<ReturnType<typeof screen.toJSON>> | string;
function iconNames(): unknown[] {
  const names: unknown[] = [];
  const walk = (node: JsonNode | JsonNode[] | null) => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.props.name !== undefined) names.push(node.props.name);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return names;
}

it('offers the shared Share PDF in the header once the figures are on screen, and shares the statement PDF', async () => {
  await render(<StatementScreen />);
  const share = await screen.findByRole('button', { name: 'Share PDF' });
  expect(share).toBeOnTheScreen();
  expect(iconNames()).toContain('file-pdf-box');
  // The old action's own icon is gone.
  expect(iconNames()).not.toContain('share-variant');

  await userEvent.setup({ delay: 0 }).press(share);
  await waitFor(() => expect(generateStatementPDF).toHaveBeenCalledWith('c2'));
  await waitFor(() => expect(downloadAndSharePDF).toHaveBeenCalledWith('https://warehouse.example.test/s.pdf', 'Statement Green Valley Traders.pdf'));
});

it('offers no Share PDF while the figures have not come', async () => {
  jest.mocked(getCustomerStatement).mockReturnValue(new Promise(() => undefined) as never);
  await render(<StatementScreen />);
  await waitFor(() => expect(getCustomerStatement).toHaveBeenCalled());
  expect(screen.queryByLabelText('Share PDF')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Share PDF' })).not.toBeOnTheScreen();
});
