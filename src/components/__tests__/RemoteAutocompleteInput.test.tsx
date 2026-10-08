import React from 'react';
import { ActivityIndicator, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { RemoteAutocompleteInput } from '../RemoteAutocompleteInput';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/hooks/useListColors', () => ({ useListColors: () => new Proxy({}, { get: () => '#ffffff' }) }));

type Item = { id: string; name: string };
const potatoes: Item = { id: 'fictional-potatoes', name: 'Backend Test Potatoes' };
const onions: Item = { id: 'fictional-onions', name: 'Backend Test Onions' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

function mount(fetchData: (query: string) => Promise<Item[]>, onSelect: (item: Item) => void = jest.fn()) {
  let renderer!: ReturnType<typeof create>;
  function Harness() {
    const [value, setValue] = React.useState('');
    return <RemoteAutocompleteInput value={value} debounceMs={250} fetchData={fetchData}
      onSelect={item => { onSelect(item); setValue(item ? item.name : ''); }}
      getItemAccessibilityLabel={item => `Select receipt item ${item.name}`}
      renderItem={item => <Text>{item.name}</Text>} keyExtractor={item => item.id} />;
  }
  return {
    get renderer() { return renderer; },
    async render() { await act(async () => { renderer = create(<Harness />); }); },
    async type(text: string) { await act(async () => { renderer.root.findByType(TextInput).props.onChangeText(text); }); },
    async settleDebounce() { await act(async () => { jest.advanceTimersByTime(250); }); },
    rows() { return renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Select receipt item') && typeof node.props.onPress === 'function'); },
    loading() { return renderer.root.findAllByType(ActivityIndicator).length > 0; },
    async unmount() { await act(async () => { renderer.unmount(); }); },
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('runs one fetch for the final text after rapid edits', async () => {
  const fetchData = jest.fn(async () => [potatoes]);
  const input = mount(fetchData);
  await input.render();
  await input.type('P');
  await input.type('Po');
  await input.type('Pot');
  expect(fetchData).not.toHaveBeenCalled();
  await input.settleDebounce();
  expect(fetchData).toHaveBeenCalledTimes(1);
  expect(fetchData).toHaveBeenCalledWith('Pot');
  expect(input.rows()).toHaveLength(1);
  expect(input.loading()).toBe(false);
  await input.unmount();
});

it('ignores a slower earlier response that arrives after a newer search', async () => {
  const first = deferred<Item[]>();
  const second = deferred<Item[]>();
  const fetchData = jest.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const input = mount(fetchData);
  await input.render();
  await input.type('Po');
  await input.settleDebounce();
  await input.type('On');
  await input.settleDebounce();
  expect(fetchData).toHaveBeenCalledTimes(2);

  await act(async () => { second.resolve([onions]); await second.promise; });
  expect(input.rows().map(row => row.props.accessibilityLabel)).toEqual(['Select receipt item Backend Test Onions']);
  expect(input.loading()).toBe(false);

  await act(async () => { first.resolve([potatoes]); await first.promise; });
  expect(input.rows().map(row => row.props.accessibilityLabel)).toEqual(['Select receipt item Backend Test Onions']);
  expect(input.loading()).toBe(false);
  await input.unmount();
});

it('drops an in-flight search once an item has been selected', async () => {
  const pending = deferred<Item[]>();
  const fetchData = jest.fn()
    .mockResolvedValueOnce([potatoes])
    .mockReturnValueOnce(pending.promise);
  const selected = jest.fn();
  const input = mount(fetchData, selected);
  await input.render();
  await input.type('Po');
  await input.settleDebounce();
  expect(input.rows()).toHaveLength(1);

  await input.type('Pot');
  await input.settleDebounce();
  expect(input.loading()).toBe(true);
  await act(async () => { input.rows()[0].props.onPress(); });
  expect(selected).toHaveBeenCalledWith(potatoes);
  expect(input.rows()).toHaveLength(0);
  expect(input.loading()).toBe(false);

  await act(async () => { pending.resolve([onions]); await pending.promise; });
  expect(input.rows()).toHaveLength(0);
  expect(input.loading()).toBe(false);
  expect(input.renderer.root.findByType(TextInput).props.value).toBe(potatoes.name);
  await input.unmount();
});

it('drops an in-flight search once the text has been cleared', async () => {
  const pending = deferred<Item[]>();
  const fetchData = jest.fn().mockReturnValueOnce(pending.promise);
  const input = mount(fetchData);
  await input.render();
  await input.type('Po');
  await input.settleDebounce();
  expect(input.loading()).toBe(true);

  await input.type('');
  expect(input.loading()).toBe(false);
  await act(async () => { pending.resolve([potatoes]); await pending.promise; });
  expect(input.rows()).toHaveLength(0);
  expect(input.loading()).toBe(false);
  expect(fetchData).toHaveBeenCalledTimes(1);
  await input.unmount();
});

it('does not fetch after unmounting before the debounce elapses', async () => {
  const fetchData = jest.fn(async () => [potatoes]);
  const input = mount(fetchData);
  await input.render();
  await input.type('Po');
  await input.unmount();
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(fetchData).not.toHaveBeenCalled();
});
