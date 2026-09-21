import React from 'react';
import { act, create } from 'react-test-renderer';
import { GRNDispatchesTab } from '@/components/grn-details/GRNDispatchesTab';
import { GRNItemsTab } from '@/components/grn-details/GRNItemsTab';

jest.mock('@/hooks/useListColors', () => ({
  useListColors: () => ({
    primary: '#f69000',
    gray50: '#11222c',
    gray100: '#20343f',
    gray400: '#78909c',
    gray500: '#90a4ae',
    gray600: '#b0bec5',
    gray700: '#cfd8dc',
    gray900: '#ffffff',
    cellBackground: '#20343f',
    statusNegative: '#bb0000',
  }),
}));

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/grn-details/GRNItemDispatchTable', () => ({
  GRNItemDispatchTable: () => {
    const { Text } = require('react-native');
    return <Text>dispatch row</Text>;
  },
}));
jest.mock('@/components/grn-details/GRNItemCard', () => ({
  GRNItemCard: ({ total_dispatched }: { total_dispatched: number }) => {
    const { Text } = require('react-native');
    return <Text>{`dispatched:${total_dispatched}`}</Text>;
  },
}));

const item = {
  id: 'line-a',
  item_name: 'Example Potatoes',
  qty: 100,
  stock: 80,
};

it('shows a retryable error instead of an empty-success dispatch state', async () => {
  const retry = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <GRNDispatchesTab
        items={[item]}
        dispatchesByItem={{}}
        error="Customer access denied"
        onRetry={retry}
      />
    );
  });

  expect(renderer.root.findByProps({ children: 'Dispatches Unavailable' })).toBeTruthy();
  expect(renderer.root.findByProps({ children: 'Customer access denied' })).toBeTruthy();

  await act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'Retry loading dispatches' }).props.onPress();
  });
  expect(retry).toHaveBeenCalledTimes(1);
});

it('derives a safe dispatched total from quantity and stock while history loads', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<GRNItemsTab items={[item]} />);
  });

  expect(renderer.root.findByProps({ children: 'dispatched:20' })).toBeTruthy();
});
