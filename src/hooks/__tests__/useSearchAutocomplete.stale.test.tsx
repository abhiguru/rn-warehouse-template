/**
 * The answer to an earlier search must not replace the answer to the search
 * the field shows now (M3-9).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useSearchAutocomplete } from '../useSearchAutocomplete';

type Hook = ReturnType<typeof useSearchAutocomplete<string>>;

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

function setup(searchFn: (query: string) => Promise<string[]>) {
  let hook!: Hook;
  const Harness = () => {
    hook = useSearchAutocomplete<string>({ searchFn, debounceMs: 300 });
    return null;
  };
  act(() => {
    create(<Harness />);
  });
  const type = (text: string) => {
    act(() => hook.handleSearchChange(text));
    act(() => {
      jest.advanceTimersByTime(300);
    });
  };
  return { get hook() { return hook; }, type };
}

it('keeps the results of the latest search when an earlier one answers last', async () => {
  const pa = deferred<string[]>();
  const pat = deferred<string[]>();
  const searchFn = jest.fn((query: string) => (query === 'pa' ? pa.promise : pat.promise));
  const view = setup(searchFn);

  view.type('pa');
  view.type('pat');
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
  const view = setup(jest.fn(() => pa.promise));
  view.type('pa');
  act(() => view.hook.clearSearch());
  await act(async () => {
    pa.resolve(['Parmar Stores']);
  });
  expect(view.hook.results).toEqual([]);
});

it('still shows the results of a single search', async () => {
  const view = setup(jest.fn(async () => ['Patel Traders']));
  view.type('pat');
  await act(async () => {});
  expect(view.hook.results).toEqual(['Patel Traders']);
});
