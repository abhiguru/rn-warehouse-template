/**
 * How often a report asks the server, and which answer it shows.
 *
 *   dispatch activity    one request on opening, one more for each new period
 *   item stock summary   the newest search is always asked for and is the one shown; a late
 *                        answer to an older search is dropped; a page is asked for once
 *   GRNs of an item      a failed load is an error with "Try again", never "no GRNs"
 * The role hook is the real one; only the services are stand-ins.
 */
import React from 'react';
import { FlatList } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import DispatchActivityScreen from '../../../../app/reports/dispatch-activity';
import ItemStockSummaryScreen from '../../../../app/reports/item-stock-summary';
import { Button } from '@/components/ui/Button';
import * as reporting from '@/services/reporting';
import { StockService } from '@/services/stock-service';
import { getAllGRNItems } from '@/services/grn-service';

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
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn(() => Promise.resolve([])) } }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});
jest.mock('@/services/reporting', () => ({ getAllDispatchActivity: jest.fn(), getCustomerDispatchActivity: jest.fn() }));
jest.mock('@/services/stock-service', () => ({ StockService: { getItemWiseStockList: jest.fn() } }));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn(), getCustomerGRNItems: jest.fn() }));

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
  for (const service of [reporting.getAllDispatchActivity, reporting.getCustomerDispatchActivity, StockService.getItemWiseStockList, getAllGRNItems]) {
    jest.mocked(service).mockReset();
  }
  mockParams = {};
});
afterEach(async () => {
  jest.useRealTimers();
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
});

describe('dispatch activity', () => {
  const all = jest.mocked(reporting.getAllDispatchActivity);
  const one = jest.mocked(reporting.getCustomerDispatchActivity);
  const range = (call: unknown[]) => call[0] as { fromDate: string; toDate: string };

  beforeEach(() => {
    all.mockResolvedValue({
      success: true,
      message: '',
      data: {
        summary: { total_dispatches: 3, total_quantity: 140, total_weight: 7000 },
        by_customer: [{ customer_id: 'c1', customer_name: 'Fictional Traders', dispatch_count: 3, total_quantity: 140, total_weight: 7000 }],
      },
    } as never);
    one.mockResolvedValue({
      success: true,
      message: '',
      data: { summary: { total_dispatches: 0, total_quantity: 0, total_weight: 0 }, dispatches: [] },
    } as never);
  });

  it('a warehouse account: one request on opening, one more when the period changes', async () => {
    await open(DispatchActivityScreen);
    expect(all).toHaveBeenCalledTimes(1);
    expect(one).not.toHaveBeenCalled();

    await press('Last 240 days');
    expect(all).toHaveBeenCalledTimes(2);
    // The second request is for the new period: it reaches further back, to the same day.
    expect(range(all.mock.calls[1]).toDate).toBe(range(all.mock.calls[0]).toDate);
    expect(range(all.mock.calls[1]).fromDate < range(all.mock.calls[0]).fromDate).toBe(true);

    await press('Last 420 days');
    expect(all).toHaveBeenCalledTimes(3);
    expect(range(all.mock.calls[2]).fromDate < range(all.mock.calls[1]).fromDate).toBe(true);
    expect(one).not.toHaveBeenCalled();
  });

  it('a customer account: one request for its customer on opening, one more when the period changes', async () => {
    await open(DispatchActivityScreen, CUSTOMER);
    expect(one).toHaveBeenCalledTimes(1);
    expect(one.mock.calls[0][0]).toMatchObject({ customerId: 'c1' });

    await press('Last 364 days');
    expect(one).toHaveBeenCalledTimes(2);
    expect(one.mock.calls[1][0]).toMatchObject({ customerId: 'c1' });
    expect(range(one.mock.calls[1]).fromDate < range(one.mock.calls[0]).fromDate).toBe(true);
    expect(all).not.toHaveBeenCalled();
  });

  it('opened for a named customer: one request for that customer, none for the list', async () => {
    mockParams = { customerId: 'c7', customerName: 'Example Agro' };
    await open(DispatchActivityScreen);
    expect(one).toHaveBeenCalledTimes(1);
    expect(one.mock.calls[0][0]).toMatchObject({ customerId: 'c7' });
    expect(all).not.toHaveBeenCalled();

    await press('Last 240 days');
    expect(one).toHaveBeenCalledTimes(2);
    expect(one.mock.calls[1][0]).toMatchObject({ customerId: 'c7' });
    expect(all).not.toHaveBeenCalled();
  });
});

describe('item stock summary', () => {
  const list = jest.mocked(StockService.getItemWiseStockList);
  const grns = jest.mocked(getAllGRNItems);
  type Page = Awaited<ReturnType<typeof StockService.getItemWiseStockList>>;

  const POTATOES = { item_id: 'item-1', item_name: 'Example Potatoes', total_qty: 100, total_stock: 60, grn_count: 1 };
  const ONIONS = { item_id: 'item-2', item_name: 'Example Onions', total_qty: 80, total_stock: 40, grn_count: 2 };
  const CARROTS = { item_id: 'item-3', item_name: 'Example Carrots', total_qty: 50, total_stock: 50, grn_count: 1 };
  const page = (items: object[], hasMore = false): Page =>
    ({ success: true, message: '', data: { items, pagination: { totalCount: items.length, hasMore, limit: 50, offset: 0 } } }) as never;
  const itemNames = () => texts().filter((text) => text.startsWith('Example '));
  const search = async (text: string) => {
    const input = tree!.root.findAll((node) => node.props.accessibilityLabel === 'Search items' && typeof node.props.onChangeText === 'function')[0];
    await act(async () => {
      input.props.onChangeText(text);
    });
    // The search waits 300 ms for more typing before it asks.
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
  };
  const isLoading = () => tree!.root.findAll((node) => node.props.accessibilityLabel === 'Loading items').length > 0;

  describe('search during a load', () => {
    it('asks for the newer search at once, and a late answer to the older one does not replace its results', async () => {
      jest.useFakeTimers();
      const first = pending<Page>();
      const second = pending<Page>();
      list.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

      await open(ItemStockSummaryScreen);
      expect(list).toHaveBeenCalledTimes(1);
      expect(list.mock.calls[0][0]).toMatchObject({ searchQuery: undefined, offset: 0 });

      // Typed while the first request is still waiting: it is not dropped.
      await search('oni');
      expect(list).toHaveBeenCalledTimes(2);
      expect(list.mock.calls[1][0]).toMatchObject({ searchQuery: 'oni', offset: 0 });

      await act(async () => {
        second.answer(page([ONIONS]));
      });
      expect(itemNames()).toEqual(['Example Onions']);
      expect(isLoading()).toBe(false);

      // The answer to the older question arrives last.
      await act(async () => {
        first.answer(page([POTATOES, ONIONS, CARROTS]));
      });
      expect(itemNames()).toEqual(['Example Onions']);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('keeps loading when the older answer arrives first, then shows the newer results', async () => {
      jest.useFakeTimers();
      const first = pending<Page>();
      const second = pending<Page>();
      list.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

      await open(ItemStockSummaryScreen);
      await search('oni');
      expect(list).toHaveBeenCalledTimes(2);

      await act(async () => {
        first.answer(page([POTATOES, ONIONS, CARROTS]));
      });
      expect(itemNames()).toEqual([]);
      expect(isLoading()).toBe(true);

      await act(async () => {
        second.answer(page([ONIONS]));
      });
      expect(itemNames()).toEqual(['Example Onions']);
      expect(isLoading()).toBe(false);
    });

    it('a failed older request does not show its error over the newer search', async () => {
      jest.useFakeTimers();
      const first = pending<Page>();
      const second = pending<Page>();
      list.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

      await open(ItemStockSummaryScreen);
      await search('oni');
      await act(async () => {
        first.answer({ success: false, message: 'refused' } as never);
      });
      expect(texts()).not.toContain('Something went wrong');
      expect(isLoading()).toBe(true);

      await act(async () => {
        second.answer(page([ONIONS]));
      });
      expect(itemNames()).toEqual(['Example Onions']);
    });
  });

  describe('next page', () => {
    it('is asked for once per offset, and its rows are added', async () => {
      const next = pending<Page>();
      list.mockResolvedValueOnce(page([POTATOES], true)).mockImplementationOnce(() => next.promise);
      await open(ItemStockSummaryScreen);
      expect(itemNames()).toEqual(['Example Potatoes']);

      // The list reports its end twice before the first report has changed anything.
      const rows = tree!.root.findByType(FlatList);
      await act(async () => {
        rows.props.onEndReached();
        rows.props.onEndReached();
      });
      expect(list).toHaveBeenCalledTimes(2);
      expect(list.mock.calls[1][0]).toMatchObject({ offset: 1 });

      await act(async () => {
        next.answer(page([ONIONS]));
      });
      expect(itemNames()).toEqual(['Example Potatoes', 'Example Onions']);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('a search typed while the next page loads replaces the list; the late page is not added to it', async () => {
      jest.useFakeTimers();
      const next = pending<Page>();
      const found = pending<Page>();
      list
        .mockResolvedValueOnce(page([POTATOES], true))
        .mockImplementationOnce(() => next.promise)
        .mockImplementationOnce(() => found.promise);
      await open(ItemStockSummaryScreen);
      await act(async () => {
        tree!.root.findByType(FlatList).props.onEndReached();
      });
      expect(list).toHaveBeenCalledTimes(2);

      await search('car');
      expect(list).toHaveBeenCalledTimes(3);
      expect(list.mock.calls[2][0]).toMatchObject({ searchQuery: 'car', offset: 0 });
      await act(async () => {
        found.answer(page([CARROTS]));
      });
      await act(async () => {
        next.answer(page([ONIONS]));
      });
      expect(itemNames()).toEqual(['Example Carrots']);
    });
  });

  describe('GRNs of an item', () => {
    const GRN = { id: 'gi-1', grn_id: 'g1', gr_no: '311', customer_name: 'Fictional Traders', date: '2026-10-01', stock: 60, qty: 100 };
    const ERROR = "Couldn't load the GRNs for this item.";
    const NONE = 'No GRNs with this item in stock.';
    const retryButtons = () => tree!.root.findAllByType(Button).filter((button) => button.props.children === 'Try again');

    beforeEach(() => {
      list.mockResolvedValue(page([POTATOES]));
    });

    it('a refused load shows an error with "Try again"; "Try again" reads the GRNs once more', async () => {
      grns.mockResolvedValueOnce({ success: false, message: 'refused' } as never);
      await open(ItemStockSummaryScreen);
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
      await open(ItemStockSummaryScreen);
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
