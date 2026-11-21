/**
 * How often a report asks the server, and which answer it shows.
 *
 *   item stock summary   one request on opening; a page is asked for once, and a failed page
 *                        is asked for again only by its "Try again" (the search and sort, and
 *                        late answers to an older search: ItemStockFlow.test.tsx)
 *   GRNs of an item      a failed load is an error with "Try again", never "no GRNs"
 * The role hook is the real one; only the services are stand-ins. The reports on the shared
 * layer keep their period in the store, so their requests per period are tested with a real
 * store (e.g. DispatchActivityFlow.test.tsx).
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import ItemStockSummaryScreen from '../../../../app/reports/item-stock-summary';
import { StockService } from '@/services/stock-service';
import { getAllGRNItems } from '@/services/grn-service';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';

let mockState: Record<string, unknown> = {};
let mockParams: Record<string, string> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn(() => Promise.resolve([])) } }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});
jest.mock('@/services/stock-service', () => ({ StockService: { getItemWiseStockList: jest.fn() } }));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn(), getCustomerGRNItems: jest.fn() }));
// The item stock summary is drawn by ReportScaffold (a FlashList) and keeps its sort per facility.
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
  onOperatorServerChange: () => () => {},
}));

const ADMIN = { id: 'p1', role: 'admin', assignedCustomerIds: [] };
const CUSTOMER = { id: 'p2', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Fictional Traders', active: true }] };

async function open(Screen: React.ComponentType, profile: object = ADMIN) {
  mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: profile } };
  await render(<Screen />);
}
const itemNames = () => screen.queryAllByText(/^Example /).map((node) => [node.props.children].flat().join(''));
const press = async (label: string) => {
  const user = userEvent.setup({ delay: 0 });
  await user.press(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
};

/** A request that stays unanswered until the test answers it. */
function pending<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Also the answers queued by a test that failed before it used them.
  for (const service of [StockService.getItemWiseStockList, getAllGRNItems]) {
    jest.mocked(service).mockReset();
  }
  mockParams = {};
});
afterEach(() => {
  jest.useRealTimers();
});

describe('item stock summary', () => {
  // The search and the sort go through the store, which is a fixed stand-in here: they are
  // tested with a real store in ItemStockFlow.test.tsx. These cases need neither.
  const list = jest.mocked(StockService.getItemWiseStockList);
  const grns = jest.mocked(getAllGRNItems);
  type Page = Awaited<ReturnType<typeof StockService.getItemWiseStockList>>;

  const POTATOES = { item_id: 'item-1', item_name: 'Example Potatoes', total_qty: 100, total_stock: 60, grn_count: 1 };
  const ONIONS = { item_id: 'item-2', item_name: 'Example Onions', total_qty: 80, total_stock: 40, grn_count: 2 };
  const page = (items: object[], totalCount = items.length): Page =>
    ({ success: true, message: '', data: { items, pagination: { totalCount, hasMore: items.length < totalCount, limit: 50, offset: 0 } } }) as never;

  // The list stand-in (flashListMock) is one host element named "FlashList" that keeps the list's
  // props, so the end of the list can be reached; Testing Library has no query for it.
  type Node = NonNullable<typeof screen.root>;
  const findFlashList = (node: Node): Node | undefined =>
    (node.type as unknown) === 'FlashList'
      ? node
      : (node.children as unknown[]).filter((child): child is Node => typeof child !== 'string').map(findFlashList).find(Boolean);
  const reachEnd = () => {
    const rows = screen.root && findFlashList(screen.root);
    if (!rows) throw new Error('The list is not on the screen');
    rows.props.onEndReached();
  };
  const footerButtons = (label: string) => screen.queryAllByRole('button', { name: label });

  let restoreQueries: () => void;
  beforeAll(() => {
    restoreQueries = makeQueryUpdatesImmediate();
  });
  afterAll(() => restoreQueries());
  beforeEach(forgetQueries);

  async function openItems(profile: object = ADMIN) {
    mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: profile }, listFilters: { lists: {} }, reportPrefs: { byScope: {} } };
    await render(<ItemStockSummaryScreen />);
    await act(settleQueries);
  }
  const run = (callback: () => void) =>
    act(async () => {
      callback();
      await settleQueries();
    });

  it('asks once on opening, for every customer, with the default sort', async () => {
    list.mockResolvedValue(page([POTATOES]));
    await openItems();
    expect(list.mock.calls).toEqual([[{ customerId: undefined, searchQuery: undefined, limit: 50, offset: 0, sortBy: 'item_name', sortOrder: 'asc' }]]);
    expect(itemNames()).toEqual(['Example Potatoes']);
  });

  describe('next page', () => {
    it('is asked for once per offset, and its rows are added', async () => {
      const next = pending<Page>();
      list.mockResolvedValueOnce(page([POTATOES], 2)).mockImplementationOnce(() => next.promise);
      await openItems();
      expect(itemNames()).toEqual(['Example Potatoes']);

      // The list reports its end twice before the first report has changed anything.
      await run(() => {
        reachEnd();
        reachEnd();
      });
      expect(list).toHaveBeenCalledTimes(2);
      expect(list.mock.calls[1][0]).toMatchObject({ offset: 1 });
      expect(screen.getByText('Loading more items')).toBeOnTheScreen();

      await run(() => next.answer(page([ONIONS], 2)));
      expect(itemNames()).toEqual(['Example Potatoes', 'Example Onions']);
      expect(screen.queryByText('Loading more items')).not.toBeOnTheScreen();
      // Everything is loaded: no more to ask for, at the end or with the button.
      await run(() => reachEnd());
      expect(list).toHaveBeenCalledTimes(2);
      expect(footerButtons('Show more items')).toHaveLength(0);
    });

    it('a failed page shows "Try again" under the rows; reaching the end does not ask again, the button does', async () => {
      list.mockResolvedValueOnce(page([POTATOES], 2)).mockResolvedValueOnce({ success: false, message: 'The facility is busy.' } as never);
      await openItems();
      expect(footerButtons('Show more items')).toHaveLength(1);
      await run(() => reachEnd());
      expect(list).toHaveBeenCalledTimes(2);
      // What failed and what to do; the service's own words are not shown.
      expect(screen.getByText("Couldn't load more items.")).toBeOnTheScreen();
      expect(screen.getByText('Check your connection and try again.')).toBeOnTheScreen();
      expect(screen.queryByText('The facility is busy.')).not.toBeOnTheScreen();
      expect(itemNames()).toEqual(['Example Potatoes']);

      await run(() => reachEnd());
      expect(list).toHaveBeenCalledTimes(2);

      list.mockResolvedValueOnce(page([ONIONS], 2));
      const user = userEvent.setup({ delay: 0 });
      await user.press(footerButtons('Try again')[0]);
      await act(settleQueries);
      expect(list).toHaveBeenCalledTimes(3);
      expect(list.mock.calls[2][0]).toMatchObject({ offset: 1 });
      expect(itemNames()).toEqual(['Example Potatoes', 'Example Onions']);
      expect(screen.queryByText("Couldn't load more items.")).not.toBeOnTheScreen();
    });
  });

  describe('GRNs of an item', () => {
    const GRN = { id: 'gi-1', grn_id: 'g1', gr_no: '311', customer_name: 'Fictional Traders', date: '2026-10-01', stock: 60, qty: 100 };
    const ERROR = "Couldn't load the GRNs for this item.";
    const NONE = 'No GRNs with this item in stock.';
    const retryButtons = () => footerButtons('Try again');

    beforeEach(() => {
      list.mockResolvedValue(page([POTATOES]));
    });

    it('a refused load shows an error with "Try again"; "Try again" reads the GRNs once more', async () => {
      grns.mockResolvedValueOnce({ success: false, message: 'refused' } as never);
      await openItems();
      await press('Example Potatoes');
      await act(settleQueries);
      expect(grns).toHaveBeenCalledTimes(1);
      expect(screen.getByText(ERROR)).toBeOnTheScreen();
      expect(screen.queryByText(NONE)).not.toBeOnTheScreen();
      expect(retryButtons()).toHaveLength(1);

      // While the second try waits, the card shows that it is loading, not the error.
      const second = pending<never>();
      grns.mockImplementationOnce(() => second.promise);
      const user = userEvent.setup({ delay: 0 });
      await user.press(retryButtons()[0]);
      expect(grns).toHaveBeenCalledTimes(2);
      expect(grns.mock.calls[1]).toEqual(grns.mock.calls[0]);
      expect(screen.getByText('Loading GRNs')).toBeOnTheScreen();
      expect(screen.queryByText(ERROR)).not.toBeOnTheScreen();

      await act(async () => {
        second.answer({ success: true, message: '', data: { items: [GRN] } } as never);
      });
      expect(screen.getByText('GRN 311')).toBeOnTheScreen();
      expect(screen.queryByText(ERROR)).not.toBeOnTheScreen();
      expect(retryButtons()).toHaveLength(0);
    });

    it('a load that throws is not kept as "no GRNs": opening the item again reads them again', async () => {
      grns.mockRejectedValueOnce(new Error('offline'));
      await openItems();
      await press('Example Potatoes');
      await act(settleQueries);
      expect(screen.getByText(ERROR)).toBeOnTheScreen();
      expect(screen.queryByText(NONE)).not.toBeOnTheScreen();

      // Closed and opened again: asked again, and this time the item truly has no GRNs in stock.
      grns.mockResolvedValueOnce({ success: true, message: '', data: { items: [] } } as never);
      await press('Example Potatoes');
      await press('Example Potatoes');
      await act(settleQueries);
      expect(grns).toHaveBeenCalledTimes(2);
      expect(screen.getByText(NONE)).toBeOnTheScreen();
      expect(screen.queryByText(ERROR)).not.toBeOnTheScreen();
      expect(retryButtons()).toHaveLength(0);

      // A real "no GRNs" answer is kept: a third opening does not ask again.
      await press('Example Potatoes');
      await press('Example Potatoes');
      await act(settleQueries);
      expect(grns).toHaveBeenCalledTimes(2);
    });
  });
});
