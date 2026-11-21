import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { RemoteAutocompleteInput, type RemoteAutocompleteInputHandle } from '../RemoteAutocompleteInput';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

type Item = { id: string; name: string };
const potatoes: Item = { id: 'fictional-potatoes', name: 'Backend Test Potatoes' };
const onions: Item = { id: 'fictional-onions', name: 'Backend Test Onions' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

/** Held promises, released after each test so a failing test cannot leave work pending. */
const releases: Array<() => void> = [];

function Harness({ fetchData, onSelect }: { fetchData: (query: string) => Promise<Item[]>; onSelect: (item: Item) => void }) {
  const [value, setValue] = React.useState('');
  return <RemoteAutocompleteInput value={value} debounceMs={250} fetchData={fetchData}
    onSelect={item => { onSelect(item); setValue(item ? item.name : ''); }}
    getItemAccessibilityLabel={item => `Select receipt item ${item.name}`}
    renderItem={item => <Text>{item.name}</Text>} keyExtractor={item => item.id} />;
}

type Json = ReturnType<typeof screen.toJSON>;
/** The spinner has no role or text, so look for its element in the rendered tree. */
function hasSpinner(node: Json | string | undefined | null): boolean {
  if (!node || typeof node === 'string') return false;
  if (Array.isArray(node)) return node.some(hasSpinner);
  return node.type === 'ActivityIndicator' || (node.children ?? []).some(child => hasSpinner(child as never));
}
const loading = () => hasSpinner(screen.toJSON());

const newUser = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
const field = () => screen.getByPlaceholderText('Type to search...');
const rows = () => screen.queryAllByRole('button', { name: /^Select receipt item/ });
const settleDebounce = () => act(async () => { jest.advanceTimersByTime(250); });

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  releases.splice(0).forEach(release => release());
  jest.useRealTimers();
});

it('runs one fetch for the final text after rapid edits', async () => {
  const fetchData = jest.fn(async () => [potatoes]);
  const user = newUser();
  await render(<Harness fetchData={fetchData} onSelect={jest.fn()} />);
  await user.type(field(), 'Pot');
  expect(fetchData).not.toHaveBeenCalled();
  await settleDebounce();
  expect(fetchData).toHaveBeenCalledTimes(1);
  expect(fetchData).toHaveBeenCalledWith('Pot');
  expect(rows()).toHaveLength(1);
  expect(loading()).toBe(false);
});

it('ignores a slower earlier response that arrives after a newer search', async () => {
  const first = deferred<Item[]>();
  const second = deferred<Item[]>();
  releases.push(() => first.resolve([]), () => second.resolve([]));
  const fetchData = jest.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const user = newUser();
  await render(<Harness fetchData={fetchData} onSelect={jest.fn()} />);
  await user.type(field(), 'Po');
  await settleDebounce();
  await user.clear(field());
  await user.type(field(), 'On');
  await settleDebounce();
  expect(fetchData).toHaveBeenCalledTimes(2);

  await act(async () => { second.resolve([onions]); await second.promise; });
  expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Select receipt item Backend Test Onions']);
  expect(loading()).toBe(false);

  await act(async () => { first.resolve([potatoes]); await first.promise; });
  expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Select receipt item Backend Test Onions']);
  expect(loading()).toBe(false);
});

it('drops an in-flight search once an item has been selected', async () => {
  const pending = deferred<Item[]>();
  releases.push(() => pending.resolve([]));
  const fetchData = jest.fn()
    .mockResolvedValueOnce([potatoes])
    .mockReturnValueOnce(pending.promise);
  const selected = jest.fn();
  const user = newUser();
  await render(<Harness fetchData={fetchData} onSelect={selected} />);
  await user.type(field(), 'Po');
  await settleDebounce();
  expect(rows()).toHaveLength(1);

  await user.type(field(), 't');
  await settleDebounce();
  expect(loading()).toBe(true);
  await user.press(rows()[0]);
  expect(selected).toHaveBeenCalledWith(potatoes);
  expect(rows()).toHaveLength(0);
  expect(loading()).toBe(false);

  await act(async () => { pending.resolve([onions]); await pending.promise; });
  expect(rows()).toHaveLength(0);
  expect(loading()).toBe(false);
  expect(field()).toHaveDisplayValue(potatoes.name);
});

it('drops an in-flight search once the text has been cleared', async () => {
  const pending = deferred<Item[]>();
  releases.push(() => pending.resolve([]));
  const fetchData = jest.fn().mockReturnValueOnce(pending.promise);
  const user = newUser();
  await render(<Harness fetchData={fetchData} onSelect={jest.fn()} />);
  await user.type(field(), 'Po');
  await settleDebounce();
  expect(loading()).toBe(true);

  await user.clear(field());
  expect(loading()).toBe(false);
  await act(async () => { pending.resolve([potatoes]); await pending.promise; });
  expect(rows()).toHaveLength(0);
  expect(loading()).toBe(false);
  expect(fetchData).toHaveBeenCalledTimes(1);
});

it('does not fetch after unmounting before the debounce elapses', async () => {
  const fetchData = jest.fn(async () => [potatoes]);
  const user = newUser();
  const { unmount } = await render(<Harness fetchData={fetchData} onSelect={jest.fn()} />);
  await user.type(field(), 'Po');
  await unmount();
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(fetchData).not.toHaveBeenCalled();
});

it('gives its text field the cursor through a ref (focus), and lets go of it (blur)', async () => {
  const ref = React.createRef<RemoteAutocompleteInputHandle>();
  await render(
    <RemoteAutocompleteInput ref={ref} value="" fetchData={async () => []} onSelect={jest.fn()} renderItem={() => <Text>x</Text>} keyExtractor={(i: Item) => i.id} />,
  );
  const proto = TextInput.prototype as unknown as Record<'focus' | 'blur', jest.Mock>;
  proto.focus.mockClear();
  proto.blur.mockClear();

  await act(() => ref.current!.focus());
  expect(proto.focus).toHaveBeenCalledTimes(1);
  // The call went to this field's TextInput (the only one on screen), not to some other input.
  expect(proto.focus.mock.contexts[0].props.accessibilityLabel).toBe(field().props.accessibilityLabel);
  await act(() => ref.current!.blur());
  expect(proto.blur).toHaveBeenCalledTimes(1);
});
