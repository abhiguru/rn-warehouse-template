import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const item = { id: 'fictional-item', name: 'Backend Test Potatoes' };
type Json = ReturnType<typeof screen.toJSON>;
type Host = NonNullable<Json> extends infer T ? Exclude<T, unknown[]> : never;
const hostViews = (node: Json | Json[]): Host[] => {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(hostViews);
  const own: Host[] = node.type === 'View' ? [node] : [];
  return own.concat((node.children ?? []).flatMap(child => (typeof child === 'string' ? [] : hostViews(child))));
};

describe('receipt item suggestions in a clipping scroll container', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it.each(['inline', 'overlay'] as const)('keeps %s suggestions selectable and preserves the selected identity', async placement => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const selected = jest.fn();
    function Harness() {
      const [value, setValue] = React.useState('');
      return <RemoteAutocompleteInput value={value} suggestionPlacement={placement}
        fetchData={async () => [item]} onSelect={value => { selected(value); setValue(value.name); }}
        getItemAccessibilityLabel={value => `Select receipt item ${value.name}`}
        renderItem={value => <Text>{value.name}</Text>} keyExtractor={value => value.id} />;
    }
    await render(<Harness />);
    await user.type(screen.getByPlaceholderText('Type to search...'), 'Potatoes');
    await act(async () => { jest.advanceTimersByTime(500); });
    const containers = hostViews(screen.toJSON()).filter(node => {
      const style = StyleSheet.flatten(node.props.style as never);
      return style?.position === (placement === 'inline' ? 'relative' : 'absolute') && style?.top === (placement === 'inline' ? 0 : '100%');
    });
    expect(containers.length).toBeGreaterThan(0);
    const row = screen.getByRole('button', { name: 'Select receipt item Backend Test Potatoes' });
    expect(row).toBeOnTheScreen();
    await user.press(row);
    expect(selected).toHaveBeenCalledTimes(1);
    expect(selected).toHaveBeenCalledWith(item);
    expect(screen.getByPlaceholderText('Type to search...')).toHaveDisplayValue(item.name);
  });
});
