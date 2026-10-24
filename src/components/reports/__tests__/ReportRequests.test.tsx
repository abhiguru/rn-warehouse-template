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
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import ItemStockSummaryScreen from '../../../../app/reports/item-stock-summary';
import { Button } from '@/components/ui/Button';
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
}));

const ADMIN = { id: 'p1', role: 'admin', assignedCustomerIds: [] };
const CUSTOMER = { id: 'p2', role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [{ id: 'c1', name: 'Fictional Traders', active: true }] };

let tree: ReactTestRenderer | undefined;
async function open(Screen: React.ComponentType, profile: object = ADMIN) {
  mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: profile } };
  await act(async () => {
    tree = create(<Screen />);
  });
}
const texts = () => tree!.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
const press = async (label: string) => {
  const control = tree!.root.findAll((node) => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel ?? '').startsWith(label))[0];
  await act(async () => {
    control.props.onPress();
  });
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
afterEach(async () => {
  jest.useRealTimers();
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
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
  const itemNames = () => texts().filter((text) => text.startsWith('Example '));
  const rows = () => tree!.root.findByType('FlashList' as never);
  const footerButtons = (label: string) => tree!.root.findAllByType(Button).filter((button) => button.props.children === label);

  let restoreQueries: () => void;
  beforeAll(() => {
    restoreQueries = makeQueryUpdatesImmediate();
  });
  afterAll(() => restoreQueries());
  beforeEach(forgetQueries);

  async function openItems(profile: object = ADMIN) {
    mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: profile }, listFilters: { lists: {} }, reportPrefs: { byScope: {} } };
    await act(async () => {
      tree = create(<ItemStockSummaryScreen />);
      await settleQueries();
    });
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
        rows().props.onEndReached();
        rows().props.onEndReached();
      });
      expect(list).toHaveBeenCalledTimes(2);
      expect(list.mock.calls[1][0]).toMatchObject({ offset: 1 });
      expect(texts()).toContain('Loading more items');

      await run(() => next.answer(page([ONIONS], 2)));
      expect(itemNames()).toEqual(['Example Potatoes', 'Example Onions']);
      expect(texts()).not.toContain('Loading more items');
      // Everything is loaded: no more to ask for, at the end or with the button.
      await run(() => rows().props.onEndReached());
      expect(list).toHaveBeenCalledTimes(2);
      expect(footerButtons('Show more items')).toHaveLength(0);
    });

    it('a failed page shows "Try again" under the rows; reaching the end does not ask again, the button does', async () => {
      list.mockResolvedValueOnce(page([POTATOES], 2)).mockResolvedValueOnce({ success: false, message: 'The facility is busy.' } as never);
      await openItems();
      expect(footerButtons('Show more items')).toHaveLength(1);
      await run(() => rows().props.onEndReached());
      expect(list).toHaveBeenCalledTimes(2);
      // What failed and what to do; the service's own words are not shown.
      expect(texts()).toEqual(expect.arrayContaining(["Couldn't load more items.", 'Check your connection and try again.']));
      expect(texts()).not.toContain('The facility is busy.');
      expect(itemNames()).toEqual(['Example Potatoes']);

      await run(() => rows().props.onEndReached());
      expect(list).toHaveBeenCalledTimes(2);

      list.mockResolvedValueOnce(page([ONIONS], 2));
      await run(() => footerButtons('Try again')[0].props.onPress());
      expect(list).toHaveBeenCalledTimes(3);
      expect(list.mock.calls[2][0]).toMatchObject({ offset: 1 });
      expect(itemNames()).toEqual(['Example Potatoes', 'Example Onions']);
      expect(texts()).not.toContain("Couldn't load more items.");
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
      expect(grns).toHaveBeenCalledTimes(1);
      expect(texts()).toContain(ERROR);
      expect(texts()).not.toContain(NONE);
      expect(retryButtons()).toHaveLength(1);

      // While the second try waits, the card shows that it is loading, not the error.
      const second = pending<never>();
      grns.mockImplementationOnce(() => second.promise);
      await act(async () => {
        retryButtons()[0].props.onPress();
      });
      expect(grns).toHaveBeenCalledTimes(2);
      expect(grns.mock.calls[1]).toEqual(grns.mock.calls[0]);
      expect(texts()).toContain('Loading GRNs');
      expect(texts()).not.toContain(ERROR);

      await act(async () => {
        second.answer({ success: true, message: '', data: { items: [GRN] } } as never);
      });
      expect(texts()).toContain('GRN 311');
      expect(texts()).not.toContain(ERROR);
      expect(retryButtons()).toHaveLength(0);
    });

    it('a load that throws is not kept as "no GRNs": opening the item again reads them again', async () => {
      grns.mockRejectedValueOnce(new Error('offline'));
      await openItems();
      await press('Example Potatoes');
      expect(texts()).toContain(ERROR);
      expect(texts()).not.toContain(NONE);

      // Closed and opened again: asked again, and this time the item truly has no GRNs in stock.
      grns.mockResolvedValueOnce({ success: true, message: '', data: { items: [] } } as never);
      await press('Example Potatoes');
      await press('Example Potatoes');
      expect(grns).toHaveBeenCalledTimes(2);
      expect(texts()).toContain(NONE);
      expect(texts()).not.toContain(ERROR);
      expect(retryButtons()).toHaveLength(0);

      // A real "no GRNs" answer is kept: a third opening does not ask again.
      await press('Example Potatoes');
      await press('Example Potatoes');
      expect(grns).toHaveBeenCalledTimes(2);
    });
  });
});
