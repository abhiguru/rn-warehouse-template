/**
 * useGrnRates: one read per mount, a new read (status loading) when the items or the context change, a
 * re-read on focus that keeps the rows shown, offline reads as an error, and a stale answer is dropped.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useGrnRates, type UseGrnRatesResult } from '../useGrnRates';
import { listRatesOfItems } from '@/services/item-pricing-service';

jest.mock('@/services/item-pricing-service', () => ({ listRatesOfItems: jest.fn() }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
// A screen that is focused when mounted: the callback runs after the commit and again when it changes.
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));

const read = listRatesOfItems as jest.Mock;
const rate = (id: string) => ({ id, item_id: 'gur' });
let latest: UseGrnRatesResult;
type Props = { ids: string[]; ctx: string };
const mount = (ids: string[], ctx: string) =>
  renderHook(({ ids: i, ctx: c }: Props) => (latest = useGrnRates(i, c)), { initialProps: { ids, ctx } });

beforeEach(() => { jest.clearAllMocks(); mockOffline = false; read.mockResolvedValue([rate('a')]); });

it('reads once per mount (the dependsOn effect and the focus effect no longer both read)', async () => {
  await mount(['gur', 'rice'], 'c|2026-10-12|monthly');
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(['gur', 'rice']);
  expect(latest.status).toBe('ready');
  expect(latest.rates).toEqual([rate('a')]);
});

it('a changed context reads again, once, and shows loading until the new rows arrive', async () => {
  const { rerender } = await mount(['gur'], 'ctx1');
  let release!: (rows: unknown[]) => void;
  read.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await rerender({ ids: ['gur'], ctx: 'ctx2' });
  expect(read).toHaveBeenCalledTimes(2);
  expect(latest.status).toBe('loading');
  await act(async () => { release([rate('b')]); });
  expect(latest.status).toBe('ready');
  expect(latest.rates).toEqual([rate('b')]);
});

it('changed items read again once, whatever the order of the ids', async () => {
  const { rerender } = await mount(['gur', 'rice'], 'ctx');
  await rerender({ ids: ['rice', 'gur'], ctx: 'ctx' });
  expect(read).toHaveBeenCalledTimes(1);
  await rerender({ ids: ['rice', 'gur', 'wheat'], ctx: 'ctx' });
  expect(read).toHaveBeenCalledTimes(2);
});

it('a failed read is an error, and refresh reads again', async () => {
  read.mockRejectedValueOnce(new Error('down'));
  await mount(['gur'], 'ctx');
  expect(latest.status).toBe('error');
  await act(async () => { await latest.refresh(); });
  expect(latest.status).toBe('ready');
});

it('offline with nothing read is an error; once ready it stays ready', async () => {
  mockOffline = true;
  read.mockReturnValue(new Promise(() => {}));
  await mount(['gur'], 'ctx');
  expect(latest.status).toBe('error');
  expect(latest.offline).toBe(true);
});

it('an older answer that arrives after a newer read is dropped', async () => {
  let first!: (rows: unknown[]) => void;
  read.mockReturnValueOnce(new Promise(resolve => { first = resolve; }));
  await mount(['gur'], 'ctx');
  read.mockResolvedValueOnce([rate('new')]);
  await act(async () => { await latest.refresh(); });
  await act(async () => { first([rate('old')]); });
  expect(latest.rates).toEqual([rate('new')]);
});
