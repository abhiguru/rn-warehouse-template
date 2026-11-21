import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { useGRNDetailTab } from '@/hooks/useGRNDetailTab';

function Harness({ id, tab }: { id: string | string[]; tab?: string | string[] }) {
  const [activeTab, select] = useGRNDetailTab(id, tab);
  return <><Text>{activeTab}</Text><Pressable accessibilityRole="button" accessibilityLabel="Choose Items" onPress={() => select('items')} /></>;
}

const chooseItems = () => userEvent.press(screen.getByRole('button', { name: 'Choose Items' }));

it('opens the linked GRN Overview and preserves manual tab changes until a new route arrives', async () => {
  const { rerender } = await render(<Harness id="first-grn" tab="overview" />);
  expect(screen.getByText('overview')).toBeOnTheScreen();
  await chooseItems();
  await rerender(<Harness id="first-grn" tab="overview" />);
  expect(screen.getByText('items')).toBeOnTheScreen();
  await rerender(<Harness id="second-grn" tab="overview" />);
  expect(screen.getByText('overview')).toBeOnTheScreen();
});

it.each<[string[]]>([[['overview']], [['overview', 'items']]])('unwraps a repeated tab parameter %j to its first value', async tab => {
  await render(<Harness id="grn" tab={tab} />);
  expect(screen.getByText('overview')).toBeOnTheScreen();
});

it('unwraps a repeated id parameter when deciding whether the route changed', async () => {
  const { rerender } = await render(<Harness id={['first-grn']} tab="overview" />);
  await chooseItems();
  await rerender(<Harness id={['first-grn']} tab="overview" />);
  expect(screen.getByText('items')).toBeOnTheScreen();
  await rerender(<Harness id={['second-grn']} tab="overview" />);
  expect(screen.getByText('overview')).toBeOnTheScreen();
});

it.each<[string | string[] | undefined]>([[undefined], ['other'], [['other']], [['items', 'overview']], [[]]])('keeps ordinary or unsupported GRN entries on Items (%j)', async tab => {
  await render(<Harness id="grn" tab={tab} />);
  expect(screen.getByText('items')).toBeOnTheScreen();
});
