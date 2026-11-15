/**
 * WH-210: the Overview tab of the item page. Its rows start at 16 dp (KeyValueCell's own padding, no extra
 * padding around them), and Deactivate / Activate shows the spinner while the request runs.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { ItemOverviewTab } from '@/components/item-details/ItemOverviewTab';
import { layout } from '@/theme/tokens';
import type { Item } from '@/types/item.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/features/gst/ItemGstTreatment', () => ({ ItemGstTreatment: () => null }));

const ITEM = { id: 'item-1', name: 'Fictional Onion', packaging: 'Bag', description: 'Red', active: true, created_at: '2026-01-01' } as unknown as Item;

let tree: ReactTestRenderer | undefined;
afterEach(() => act(() => { tree?.unmount(); tree = undefined; }));
const render = (props: Partial<React.ComponentProps<typeof ItemOverviewTab>> = {}) => {
  act(() => {
    tree = create(<ItemOverviewTab item={ITEM} busy={false} onToggleActive={jest.fn()} onDelete={jest.fn()} {...props} />);
  });
  return tree as ReactTestRenderer;
};

/** The sum of the side padding of every View between this text and the scroll content. */
const sidePaddingAbove = (node: ReactTestInstance) => {
  let total = 0;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if ((parent.type as unknown) !== 'View') continue;
    const style = StyleSheet.flatten(parent.props.style) ?? {};
    total += (style.paddingHorizontal as number | undefined) ?? (style.paddingLeft as number | undefined) ?? 0;
  }
  return total;
};

describe('item overview rows', () => {
  it('start at 16 dp: only the cell\'s own padding, none added around the rows', () => {
    const t = render();
    const name = t.root.findAllByType(Text).find(node => node.props.children === 'Fictional Onion');
    expect(name).toBeDefined();
    expect(sidePaddingAbove(name as ReactTestInstance)).toBe(layout.marginCompact);
  });
});

describe('Deactivate and Activate', () => {
  const toggle = (t: ReactTestRenderer, label: string) =>
    t.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function' || (node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label))[0];

  it('show no spinner while idle', () => {
    expect(render().root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('show the spinner and are marked busy and disabled while the request runs', () => {
    const t = render({ busy: true });
    expect(t.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    const button = toggle(t, 'Deactivate item');
    expect(button).toBeDefined();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('show the spinner on Activate for a deactivated item too', () => {
    const t = render({ item: { ...ITEM, active: false }, busy: true });
    expect(t.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(toggle(t, 'Activate item')?.props.accessibilityState).toMatchObject({ busy: true });
  });
});
