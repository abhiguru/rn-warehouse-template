/**
 * The answer to an earlier search must not replace the answer to the search
 * the field shows now (M3-9).
 */
import { act, renderHook } from '@testing-library/react-native';
import { useSearchAutocomplete } from '../useSearchAutocomplete';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function setup(searchFn: (query: string) => Promise<string[]>) {
  const { result } = await renderHook(() => useSearchAutocomplete<string>({ searchFn, debounceMs: 300 }));
  const type = async (text: string) => {
    await act(() => result.current.handleSearchChange(text));
    await act(() => {
      jest.advanceTimersByTime(300);
    });
  };
  return { get hook() { return result.current; }, type };
}

it('keeps the results of the latest search when an earlier one answers last', async () => {
  const pa = deferred<string[]>();
  const pat = deferred<string[]>();
  const searchFn = jest.fn((query: string) => (query === 'pa' ? pa.promise : pat.promise));
  const view = await setup(searchFn);

  await view.type('pa');
  await view.type('pat');
  expect(searchFn).toHaveBeenCalledTimes(2);

  await act(async () => {
    pat.resolve(['Patel Traders']);
  });
  expect(view.hook.results).toEqual(['Patel Traders']);

  await act(async () => {
    pa.resolve(['Parmar Stores', 'Patel Traders', 'Pandya Agro']);
  });
  expect(view.hook.results).toEqual(['Patel Traders']);
  expect(view.hook.isLoading).toBe(false);
});

it('drops an answer that arrives after the search was cleared', async () => {
  const pa = deferred<string[]>();
  const view = await setup(jest.fn(() => pa.promise));
  await view.type('pa');
  await act(() => view.hook.clearSearch());
  await act(async () => {
    pa.resolve(['Parmar Stores']);
  });
  expect(view.hook.results).toEqual([]);
});

it('still shows the results of a single search', async () => {
  const view = await setup(jest.fn(async () => ['Patel Traders']));
  await view.type('pat');
  await act(() => Promise.resolve());
  expect(view.hook.results).toEqual(['Patel Traders']);
});
