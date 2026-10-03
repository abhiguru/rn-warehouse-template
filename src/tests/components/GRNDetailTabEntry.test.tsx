import React from 'react';
import { Text, Pressable } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useGRNDetailTab } from '@/hooks/useGRNDetailTab';

function Harness({ id, tab }: { id: string; tab?: string | string[] }) {
  const [activeTab, select] = useGRNDetailTab(id, tab);
  return <><Text>{activeTab}</Text><Pressable accessibilityLabel="Choose Items" onPress={() => select('items')} /></>;
}

it('opens the linked GRN Overview and preserves manual tab changes until a new route arrives', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<Harness id="first-grn" tab="overview" />); });
  expect(renderer.root.findByType(Text).props.children).toBe('overview');
  await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Choose Items' }).props.onPress(); });
  await act(async () => { renderer.update(<Harness id="first-grn" tab="overview" />); });
  expect(renderer.root.findByType(Text).props.children).toBe('items');
  await act(async () => { renderer.update(<Harness id="second-grn" tab="overview" />); });
  expect(renderer.root.findByType(Text).props.children).toBe('overview');
  await act(async () => { renderer.unmount(); });
});

it.each([undefined, 'other', ['overview']])('keeps ordinary or unsupported GRN entries on Items (%j)', async tab => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<Harness id="grn" tab={tab} />); });
  expect(renderer.root.findByType(Text).props.children).toBe('items');
  await act(async () => { renderer.unmount(); });
});
