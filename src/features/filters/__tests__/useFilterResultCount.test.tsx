import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { CountableFilterList } from '../configs';
import type { FilterContext, FilterValues } from '../types';
import { COUNT_DEBOUNCE_MS, resultsLabel, useFilterResultCount, type FilterResultCount } from '../useFilterResultCount';

const ctx: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };

type Pending = { values: FilterValues; resolve: (count: number) => void; reject: (error: Error) => void };

function setup(enabled = true) {
  const pending: Pending[] = [];
  const config = {
    listKey: 'test-list',
    title: 'Test',
    noun: ['item', 'items'],
    fields: [],
    fastFilters: [],
    countResults: jest.fn(
      (values: FilterValues) =>
        new Promise<number>((resolve, reject) => {
          pending.push({ values, resolve, reject });
        })
    ),
  } as unknown as CountableFilterList;

  let latest!: FilterResultCount;
  function Probe({ values }: { values: FilterValues }) {
    latest = useFilterResultCount(config, values, undefined, ctx, enabled);
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe values={{}} />);
  });
  return {
    config,
    pending,
    result: () => latest,
    change: (values: FilterValues) => act(() => renderer.update(<Probe values={values} />)),
    wait: (ms: number) => act(() => { jest.advanceTimersByTime(ms); }),
    answer: async (index: number, count: number) => {
      await act(async () => { pending[index].resolve(count); });
    },
    fail: async (index: number) => {
      await act(async () => { pending[index].reject(new Error('offline')); });
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('filter result count', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks once, 400 ms after the last change', () => {
    const probe = setup();
    probe.wait(COUNT_DEBOUNCE_MS - 1);
    probe.change({ stock: 'in_stock' });
    probe.wait(COUNT_DEBOUNCE_MS - 1);
    expect(probe.config.countResults).not.toHaveBeenCalled();
    probe.wait(1);
    expect(probe.config.countResults).toHaveBeenCalledTimes(1);
    expect(probe.pending[0].values).toEqual({ stock: 'in_stock' });
    probe.unmount();
  });

  it('does not ask again when the same values arrive in a new object', () => {
    const probe = setup();
    probe.wait(COUNT_DEBOUNCE_MS);
    probe.change({});
    probe.wait(COUNT_DEBOUNCE_MS);
    expect(probe.config.countResults).toHaveBeenCalledTimes(1);
    probe.unmount();
  });

  it('shows the count when the answer arrives', async () => {
    const probe = setup();
    expect(probe.result()).toEqual({ count: null, loading: true });
    probe.wait(COUNT_DEBOUNCE_MS);
    await probe.answer(0, 24);
    expect(probe.result()).toEqual({ count: 24, loading: false });
    probe.unmount();
  });

  it('keeps the latest question when answers arrive out of order', async () => {
    const probe = setup();
    probe.wait(COUNT_DEBOUNCE_MS);
    probe.change({ stock: 'in_stock' });
    probe.wait(COUNT_DEBOUNCE_MS);
    expect(probe.pending).toHaveLength(2);

    await probe.answer(1, 7);
    expect(probe.result()).toEqual({ count: 7, loading: false });
    // The slow answer to the first question must not replace it.
    await probe.answer(0, 210);
    expect(probe.result()).toEqual({ count: 7, loading: false });
    probe.unmount();
  });

  it('keeps the previous count on screen while the next one loads', async () => {
    const probe = setup();
    probe.wait(COUNT_DEBOUNCE_MS);
    await probe.answer(0, 24);
    probe.change({ stock: 'in_stock' });
    expect(probe.result()).toEqual({ count: 24, loading: true });
    probe.unmount();
  });

  it('falls back to no count when the request fails', async () => {
    const probe = setup();
    probe.wait(COUNT_DEBOUNCE_MS);
    await probe.fail(0);
    expect(probe.result()).toEqual({ count: null, loading: false });
    probe.unmount();
  });

  it('asks nothing while disabled', () => {
    const probe = setup(false);
    probe.wait(COUNT_DEBOUNCE_MS * 3);
    expect(probe.config.countResults).not.toHaveBeenCalled();
    expect(probe.result()).toEqual({ count: null, loading: false });
    probe.unmount();
  });
});

describe('apply button label', () => {
  const noun: [string, string] = ['item', 'items'];
  it('names the count, with the singular for one', () => {
    expect(resultsLabel({ count: 24, loading: false }, noun)).toBe('Show 24 items');
    expect(resultsLabel({ count: 1, loading: false }, noun)).toBe('Show 1 item');
  });
  it('groups large counts the Indian way', () => {
    expect(resultsLabel({ count: 123456, loading: false }, noun)).toBe('Show 1,23,456 items');
  });
  it('says so when nothing matches, and stays usable with no count', () => {
    expect(resultsLabel({ count: 0, loading: false }, noun)).toBe('No items match');
    expect(resultsLabel({ count: null, loading: true }, noun)).toBe('Show results');
  });
});
