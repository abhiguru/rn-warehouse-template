import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { BRANDS, fontWeight, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { KPICard } from '../KPICard';
import { KPIGrid } from '../KPIGrid';
import { ReportHeader } from '../ReportHeader';
import { ReportEmptyState } from '../ReportEmptyState';
import { ReportCustomerCard } from '../ReportCustomerCard';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }), router: { back: jest.fn() } }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function render(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function flat(node: ReactTestInstance) {
  const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
  return (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
}

function hasStyle(tree: ReactTestRenderer, key: string, value: unknown) {
  return tree.root.findAll(n => typeof n.type === 'string' && flat(n)[key] === value).length > 0;
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));
}

describe.each(THEMES)('report components in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('KPI tiles are cards with token colours and labels', () => {
    const tree = render(brand, mode, (
      <KPIGrid
        title="Summary"
        items={[
          { icon: 'warehouse', value: 1200, label: 'Stock', variant: 'primary' },
          { icon: 'alert', value: 3, label: 'Over 1 year', variant: 'warning' },
          { icon: 'check', value: 9, label: 'Done', variant: 'success' },
          { icon: 'minus', value: 1, label: 'Other', variant: 'neutral' },
        ]}
      />
    ));
    expect(hasStyle(tree, 'backgroundColor', t.surface.card)).toBe(true);
    expect(hasStyle(tree, 'backgroundColor', t.brand.subtle)).toBe(true);
    expect(hasStyle(tree, 'backgroundColor', t.status.critical.background)).toBe(true);
    expect(hasStyle(tree, 'backgroundColor', t.status.positive.background)).toBe(true);
    expect(hasStyle(tree, 'backgroundColor', t.status.neutral.background)).toBe(true);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Summary', '1,200', 'Stock', 'Over 1 year']));
    act(() => tree.unmount());
  });

  it('colours a trend only when the KPI says whether up is good', () => {
    const icons = (tree: ReactTestRenderer) =>
      tree.root.findAll(n => (n.type as unknown) === 'Icon').map(n => [n.props.name, n.props.color]);

    let tree = render(brand, mode, <KPICard icon="cash" value="₹10" label="Paid" trend={1} trendValue="5%" upIsGood />);
    expect(icons(tree)).toContainEqual(['arrow-up', t.status.positive.text]);
    act(() => tree.unmount());

    tree = render(brand, mode, <KPICard icon="cash" value="₹10" label="Overdue" trend={1} trendValue="5%" upIsGood={false} />);
    expect(icons(tree)).toContainEqual(['arrow-up', t.status.negative.text]);
    act(() => tree.unmount());

    tree = render(brand, mode, <KPICard icon="cash" value="₹10" label="Orders" trend={-1} trendValue="5%" />);
    expect(icons(tree)).toContainEqual(['arrow-down', t.text.secondary]);
    act(() => tree.unmount());
  });

  it('header uses header surface, brand tint actions and labelled buttons', () => {
    const onShare = jest.fn();
    const tree = render(brand, mode, (
      <ReportHeader title="Stock summary" subtitle="All customers" actions={[{ icon: 'file-pdf-box', label: 'Share stock PDF', onPress: onShare }]} />
    ));
    expect(hasStyle(tree, 'backgroundColor', t.surface.header)).toBe(true);
    const buttons = tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
    expect(buttons.map(b => b.props.accessibilityLabel)).toEqual(['Back', 'Share stock PDF']);
    const iconColours = tree.root.findAll(n => (n.type as unknown) === 'Icon').map(n => n.props.color);
    expect(iconColours.every(c => c === t.brand.tint)).toBe(true);
    act(() => buttons[1].props.onPress());
    expect(onShare).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('empty and error states use the hero icon colours and offer the action', () => {
    const onRetry = jest.fn();
    let tree = render(brand, mode, <ReportEmptyState message="No stock yet" description="Stock appears here." />);
    expect(tree.root.findAll(n => (n.type as unknown) === 'Icon')[0].props.color).toBe(t.icon.secondary);
    act(() => tree.unmount());

    tree = render(brand, mode, (
      <ReportEmptyState tone="error" message="Something went wrong" description="Try later." actionLabel="Try again" onAction={onRetry} />
    ));
    expect(tree.root.findAll(n => (n.type as unknown) === 'Icon')[0].props.color).toBe(t.status.negative.text);
    expect(texts(tree)).toContain('Try again');
    act(() => tree.unmount());
  });

  it('customer cell uses token colours and highlights the search words', () => {
    let tree = render(brand, mode, (
      <ReportCustomerCard title="Patel Traders" subtitle="3 items" value={1200} onPress={jest.fn()} onShare={jest.fn()} />
    ));
    expect(hasStyle(tree, 'backgroundColor', t.surface.card)).toBe(true);
    expect(texts(tree)).toContain('1,200');
    const share = tree.root.findAll(n => n.props.accessibilityLabel === 'Share PDF for Patel Traders' && typeof n.props.onPress === 'function');
    expect(share.length).toBeGreaterThan(0);
    // Without search words the name is plain text, as on every screen that does not pass them.
    expect(tree.root.findAll(n => (n.type as unknown) === 'Text' && flat(n).fontWeight === fontWeight.bold)).toHaveLength(0);
    act(() => tree.unmount());

    tree = render(brand, mode, (
      <ReportCustomerCard title="Green Valley Traders" highlightWords={['valley']} subtitle="2 GRNs" value={300} onPress={jest.fn()} />
    ));
    const boldText = tree.root.findAll(n => (n.type as unknown) === 'Text' && flat(n).fontWeight === fontWeight.bold);
    expect(boldText.map(n => n.props.children)).toEqual(['Valley']);
    // The row still reads the whole name.
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Green Valley Traders, 2 GRNs, 300 units' && typeof n.props.onPress === 'function').length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
});

