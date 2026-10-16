import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { GRNHeroHeader } from '@/components/grn-details/GRNHeroHeader';
import { GRNItemsTab } from '@/components/grn-details/GRNItemsTab';
import { GRNImagesTab } from '@/components/grn-details/GRNImagesTab';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function render(element: React.ReactElement, brand: string, mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    // A no-break space keeps a number with its unit on screen; read it as a space here.
    .map(node => [].concat(node.props.children).join('').replace(/\u00A0/g, ' '));
}

describe.each(THEMES)('GRN details in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders the hero header on surface.card with a worded stock status', () => {
    const tree = render(
      <GRNHeroHeader gr_no="Z0797" date="2026-10-09" total_qty={100} total_stock={10} total_dispatched={90} customer_name="Patel Traders" />,
      brand,
      mode
    );
    const container = tree.root.findAll(n => (n.type as unknown) === 'View')[0];
    expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe(t.surface.card);
    const all = texts(tree);
    expect(all).toContain('Z0797');
    expect(all).toContain('Patel Traders · 9 Oct 2026');
    expect(all).toContain('Low stock');
    const tag = tree.root.findByProps({ accessibilityLabel: 'Low stock' });
    expect(StyleSheet.flatten(tag.props.style).backgroundColor).toBe(t.status.critical.background);
    act(() => tree.unmount());
  });

  it('renders an item row with tokens and a status word', () => {
    const tree = render(
      <GRNItemsTab items={[{ id: 'l1', item_name: 'Potato', qty: 120, stock: 0, weight: 1250.5, rack: 'B-14', package_mark: 'PT' }]} />,
      brand,
      mode
    );
    let all = texts(tree);
    // Everything dispatched is the normal end of a GRN: In stock reads 0, no error tag
    expect(all).not.toContain('Out of stock');
    expect(all).not.toContain('Low stock');
    // The weight of one package, after the mark.
    expect(all).toContain('PT · 1,250.5 kg each');
    expect(all.some(text => /1,250\.5 kg$/.test(text))).toBe(false);
    act(() => tree.root.findAll(n => n.props.testID === 'grn-item-row-l1' && typeof n.props.onPress === 'function')[0].props.onPress());
    all = texts(tree);
    expect(all).toContain('Rack B-14');
    const backgrounds = tree.root
      .findAll(n => typeof n.type === 'string')
      .map(n => StyleSheet.flatten(n.props.style)?.backgroundColor)
      .filter(Boolean);
    expect(backgrounds).toEqual(expect.arrayContaining([t.surface.card, t.background.base]));
    expect(backgrounds).not.toContain(t.brand.fill);
    act(() => tree.unmount());
  });

  it('renders the items empty state and the images grid', () => {
    const empty = render(<GRNItemsTab items={[]} />, brand, mode);
    expect(texts(empty)).toContain('No items');
    act(() => empty.unmount());

    const images = render(
      <GRNImagesTab
        images={[
          { id: '1', image_url: 'https://example.com/1.jpg', category: 'header' },
          { id: '2', image_url: 'https://example.com/2.jpg', category: 'item', item_name: 'Potato' },
        ]}
        onUpload={jest.fn()}
        onDeleteImage={jest.fn()}
      />,
      brand,
      mode
    );
    expect(images.root.findByProps({ accessibilityLabel: 'Delete photo of Potato' })).toBeTruthy();
    expect(images.root.findByProps({ accessibilityLabel: 'All, 2 images' }).props.accessibilityState).toEqual({ selected: true });
    act(() => images.unmount());
  });
});
