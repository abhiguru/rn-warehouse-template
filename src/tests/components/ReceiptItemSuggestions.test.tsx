import React from 'react';
import { Text, TextInput, View, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const item = { id: 'fictional-item', name: 'Backend Test Potatoes' };

describe('receipt item suggestions in a clipping scroll container', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it.each(['inline', 'overlay'] as const)('keeps %s suggestions selectable and preserves the selected identity', async placement => {
    const selected = jest.fn();
    let renderer!: ReturnType<typeof create>;
    function Harness() {
      const [value, setValue] = React.useState('');
      return <RemoteAutocompleteInput value={value} suggestionPlacement={placement}
        fetchData={async () => [item]} onSelect={value => { selected(value); setValue(value.name); }}
        getItemAccessibilityLabel={value => `Select receipt item ${value.name}`}
        renderItem={value => <Text>{value.name}</Text>} keyExtractor={value => value.id} />;
    }
    await act(async () => { renderer = create(<Harness />); });
    await act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('Potatoes');
      jest.advanceTimersByTime(500);
    });
    const containers = renderer.root.findAllByType(View).filter(node => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.position === (placement === 'inline' ? 'relative' : 'absolute') && style?.top === (placement === 'inline' ? 0 : '100%');
    });
    expect(containers.length).toBeGreaterThan(0);
    const row = renderer.root.findAll(node => node.props.accessibilityLabel === 'Select receipt item Backend Test Potatoes' && typeof node.props.onPress === 'function')[0];
    expect(row).toBeDefined();
    await act(async () => row.props.onPress());
    expect(selected).toHaveBeenCalledTimes(1);
    expect(selected).toHaveBeenCalledWith(item);
    expect(renderer.root.findByType(TextInput).props.value).toBe(item.name);
    await act(async () => renderer.unmount());
  });
});
