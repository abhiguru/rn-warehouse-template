import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { listActiveItems, listAllRates, listItemRates } from '@/services/item-pricing-service';
import { notifyRatesChanged } from '../contract';
import { clearItemRatesCache, markItemRatesStale, reloadItemRatesCache, RATES_STALE_MS, useItemRates, useItemRatesFor, type UseItemRatesResult, type UseItemRatesForResult } from '../useItemRates';
import { F1, ITEMS } from '@/tests/helpers/ratesFixtures';

jest.mock('@/services/item-pricing-service', () => ({
  listActiveItems: jest.fn(),
  listAllRates: jest.fn(),
  listItemRates: jest.fn(),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ instanceId: 'test-facility' }) }));

jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: { id: 'user-1', role: 'admin' } } }),
}));

/** Let queued promises and state updates settle. */
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const waitFor = async (check: () => void) => { await flush(); check(); };
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let latest: UseItemRatesResult;
function ListProbe() {
  latest = useItemRates();
  return <Text>{`${latest.status}:${latest.items.length}`}</Text>;
}
let latestPage: UseItemRatesForResult;
function PageProbe({ id }: { id: string }) {
  latestPage = useItemRatesFor(id);
  return <Text>{latestPage.status}</Text>;
}
const wrap = (node: React.ReactElement) => {
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(node); });
  return renderer;
};

beforeEach(() => {
  clearItemRatesCache();
  jest.clearAllMocks();
  jest.mocked(listActiveItems).mockResolvedValue(ITEMS);
  jest.mocked(listAllRates).mockResolvedValue(F1);
  jest.mocked(listItemRates).mockResolvedValue(F1.filter(r => r.item_id === 'cumin'));
});

describe('useItemRates', () => {
  it('loads the items and every rate once', async () => {
    const view = wrap(<ListProbe />);
    expect(latest.status).toBe('loading');
    await waitFor(() => expect(latest.status).toBe('ready'));
    expect(latest.items).toHaveLength(ITEMS.length);
    expect(latest.rates).toHaveLength(F1.length);
    expect(latest.itemRates('cumin')?.rows).toHaveLength(3);
    act(() => view.unmount());
  });

  it('a second mount with a fresh cache is ready at once and reads again in the background (P-16)', async () => {
    const first = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('ready'));
    act(() => first.unmount());

    const second = wrap(<ListProbe />);
    expect(latest.status).toBe('ready');
    expect(latest.items).toHaveLength(ITEMS.length);
    await flush();
    expect(listAllRates).toHaveBeenCalledTimes(2);
    act(() => second.unmount());
  });

  it('a second mount with a stale cache is ready before the refetch resolves (P-16)', async () => {
    const first = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('ready'));
    act(() => first.unmount());

    const realNow = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(realNow + RATES_STALE_MS + 1000);
    const slow = deferred<typeof F1>();
    jest.mocked(listAllRates).mockReturnValue(slow.promise);
    const second = wrap(<ListProbe />);
    expect(latest.status).toBe('ready');
    expect(latest.items).toHaveLength(ITEMS.length);
    expect(listAllRates).toHaveBeenCalledTimes(2);
    await act(async () => { slow.resolve(F1); });
    act(() => second.unmount());
    spy.mockRestore();
  });

  it('refreshIfStale skips a fresh cache, and reads again once markItemRatesStale was called', async () => {
    const view = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('ready'));
    expect(listAllRates).toHaveBeenCalledTimes(1);
    await act(async () => { await latest.refreshIfStale(); });
    expect(listAllRates).toHaveBeenCalledTimes(1);
    act(() => { markItemRatesStale(); });
    await act(async () => { await latest.refreshIfStale(); });
    expect(listAllRates).toHaveBeenCalledTimes(2);
    act(() => view.unmount());
  });

  it('reloadItemRatesCache starts a new load even when one is running', async () => {
    const view = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('ready'));
    const slow = deferred<typeof F1>();
    jest.mocked(listAllRates).mockReturnValueOnce(slow.promise);
    void reloadItemRatesCache();
    const newer = F1.slice(0, 1);
    jest.mocked(listAllRates).mockResolvedValueOnce(newer);
    await act(async () => { await reloadItemRatesCache(); });
    expect(listAllRates).toHaveBeenCalledTimes(3);
    expect(latest.rates).toHaveLength(1);
    await act(async () => { slow.resolve(F1); });
    expect(latest.rates).toHaveLength(1);
    act(() => view.unmount());
  });

  it('a failed first load is an error, not an empty list (P-15)', async () => {
    jest.mocked(listAllRates).mockRejectedValue(new Error('offline'));
    const view = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('error'));
    expect(latest.items).toEqual([]);
    act(() => view.unmount());
  });

  it('a failed refresh keeps the rows and says so (P-15)', async () => {
    const view = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('ready'));
    jest.mocked(listAllRates).mockRejectedValue(new Error('offline'));
    await act(async () => { await latest.refresh(); });
    expect(latest.status).toBe('ready');
    expect(latest.rates).toHaveLength(F1.length);
    expect(latest.refreshError).toBe(true);
    act(() => view.unmount());
  });

  it("notifyRatesChanged('cumin') refetches that item's rows once and merges them (P-16)", async () => {
    const view = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('ready'));
    const changed = [{ ...F1[1], unit_price: 13 }];
    jest.mocked(listItemRates).mockResolvedValue(changed);
    await act(async () => { notifyRatesChanged('cumin'); });
    await waitFor(() => expect(latest.itemRates('cumin')?.rows).toHaveLength(1));
    expect(listItemRates).toHaveBeenCalledTimes(1);
    expect(listItemRates).toHaveBeenCalledWith('cumin');
    expect(latest.itemRates('cumin')?.rows[0].unit_price).toBe(13);
    expect(latest.itemRates('garlic')?.rows).toHaveLength(2);
    act(() => view.unmount());
  });
});

describe('useItemRatesFor', () => {
  it("reads the item's own rows, not the list of all rates (P-27)", async () => {
    const view = wrap(<PageProbe id="cumin" />);
    await waitFor(() => expect(latestPage.status).toBe('ready'));
    expect(listItemRates).toHaveBeenCalledWith('cumin');
    expect(listAllRates).not.toHaveBeenCalled();
    expect(latestPage.itemRates?.item.name).toBe('Review Cumin Bold');
    expect(latestPage.itemRates?.rows).toHaveLength(3);
    act(() => view.unmount());
  });

  it('says not found for an item that is not active', async () => {
    jest.mocked(listItemRates).mockResolvedValue([]);
    const view = wrap(<PageProbe id="missing" />);
    await waitFor(() => expect(latestPage.notFound).toBe(true));
    act(() => view.unmount());
  });

  it('refetches after a save elsewhere', async () => {
    const view = wrap(<PageProbe id="cumin" />);
    await waitFor(() => expect(latestPage.status).toBe('ready'));
    jest.mocked(listItemRates).mockResolvedValue([{ ...F1[1], unit_price: 14 }]);
    await act(async () => { notifyRatesChanged('cumin'); });
    await waitFor(() => expect(latestPage.itemRates?.rows[0].unit_price).toBe(14));
    act(() => view.unmount());
  });
});

// CR-12: a load that was running when the cache was cleared must not write its old data back.
describe('a load that is overtaken', () => {
  it('does not overwrite the data of the session that started after clearItemRatesCache', async () => {
    const late = deferred<typeof F1>();
    jest.mocked(listAllRates).mockReturnValueOnce(late.promise);
    const first = wrap(<ListProbe />);
    await flush();
    act(() => first.unmount());
    clearItemRatesCache();

    jest.mocked(listAllRates).mockResolvedValue(F1.slice(0, 1));
    const second = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('ready'));
    expect(latest.rates).toHaveLength(1);

    await act(async () => { late.resolve(F1); });
    await flush();
    expect(latest.rates).toHaveLength(1);
    act(() => second.unmount());
  });
});

// CR-13: a page opened before the list cache existed stops reading the items table once the cache holds the item.
describe('useItemRatesFor and the items table', () => {
  it('reads the active items again only while the cache does not hold the item', async () => {
    const page = wrap(<PageProbe id="cumin" />);
    await waitFor(() => expect(latestPage.status).toBe('ready'));
    expect(listActiveItems).toHaveBeenCalledTimes(1);

    const list = wrap(<ListProbe />);
    await waitFor(() => expect(latest.status).toBe('ready'));
    jest.mocked(listActiveItems).mockClear();

    await act(async () => { notifyRatesChanged('cumin'); });
    await flush();
    expect(listActiveItems).not.toHaveBeenCalled();
    act(() => { list.unmount(); page.unmount(); });
  });
});

describe('F21: a read that began before a save is not reused after it', () => {
  it('the page shows the rows read after the save, not the ones read before', async () => {
    const before = deferred<typeof F1>();
    jest.mocked(listItemRates).mockReturnValueOnce(before.promise);
    const view = wrap(<PageProbe id="cumin" />);
    await flush();
    // The save lands while the first read is still running; the second read sees the new rows.
    const after = [{ ...F1[1], unit_price: 99 }];
    jest.mocked(listItemRates).mockResolvedValueOnce(after);
    await act(async () => { notifyRatesChanged('cumin'); });
    await flush();
    expect(listItemRates).toHaveBeenCalledTimes(2);
    // The older read finishes last: it must not put its rows on the page.
    await act(async () => { before.resolve(F1.filter(r => r.item_id === 'cumin')); });
    await flush();
    expect(latestPage.itemRates?.rows.map(r => r.unit_price)).toEqual([99]);
    act(() => view.unmount());
  });
});
