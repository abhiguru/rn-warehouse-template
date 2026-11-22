/**
 * WH-210: the Overview tab of the item page. Its rows start at 16 dp (KeyValueCell's own padding, no extra
 * padding around them), and Deactivate / Activate shows the spinner while the request runs.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
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

const renderTab = async (props: Partial<React.ComponentProps<typeof ItemOverviewTab>> = {}) => {
  await render(<ItemOverviewTab item={ITEM} busy={false} onToggleActive={jest.fn()} onDelete={jest.fn()} {...props} />);
};

/** The spinner has no role or text a query can reach, so its host elements are counted in the rendered tree. */
type Json = ReturnType<typeof screen.toJSON>;
const countSpinners = (node: Json | string | undefined | null): number => {
  if (!node || typeof node === 'string') return 0;
  if (Array.isArray(node)) return node.reduce((sum: number, child) => sum + countSpinners(child), 0);
  return (node.type === 'ActivityIndicator' ? 1 : 0) + (node.children ?? []).reduce((sum: number, child) => sum + countSpinners(child as never), 0);
};
const spinners = () => countSpinners(screen.toJSON());

/** The sum of the side padding of every View between this text and the scroll content (no query reaches a parent). */
const sidePaddingAbove = (node: ReturnType<typeof screen.getByText>) => {
  let total = 0;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if ((parent.type as unknown) !== 'View') continue;
    const style = StyleSheet.flatten(parent.props.style) ?? {};
    total += (style.paddingHorizontal as number | undefined) ?? (style.paddingLeft as number | undefined) ?? 0;
  }
  return total;
};

describe('item overview rows', () => {
  it('start at 16 dp: only the cell\'s own padding, none added around the rows', async () => {
    await renderTab();
    expect(sidePaddingAbove(screen.getByText('Fictional Onion'))).toBe(layout.marginCompact);
  });
});

describe('Deactivate and Activate', () => {
  it('show no spinner while idle', async () => {
    await renderTab();
    expect(spinners()).toBe(0);
  });

  it('show the spinner and are marked busy and disabled while the request runs', async () => {
    await renderTab({ busy: true });
    expect(spinners()).toBeGreaterThan(0);
    const button = screen.getByRole('button', { name: 'Deactivate item' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('show the spinner on Activate for a deactivated item too', async () => {
    await renderTab({ item: { ...ITEM, active: false }, busy: true });
    expect(spinners()).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Activate item' }).props.accessibilityState).toMatchObject({ busy: true });
  });
});
