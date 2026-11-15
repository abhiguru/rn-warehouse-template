/**
 * WH-216: the shared parts the object pages are built from: KeyValueCell with a node in the value
 * position (valueAccessory), ui/SectionHeader with and without its side inset, and the detail tab
 * bar that sizes its tabs to their labels and scrolls with marginCompact at both ends.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { KeyValueCell } from '../fiori/KeyValueCell';
import { SectionHeader } from '../ui/SectionHeader';
import { GenericDetailTabNavigator, TAB_ICONS } from '../common/GenericDetailTabNavigator';
import { layout, space } from '@/theme/tokens';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

let tree: ReactTestRenderer | undefined;
afterEach(() => act(() => { tree?.unmount(); tree = undefined; }));
const render = (element: React.ReactElement) => {
  act(() => { tree = create(element); });
  return tree as ReactTestRenderer;
};
const texts = (t: ReactTestRenderer) => t.root.findAllByType(Text).map(node => [node.props.children].flat(3).join(''));

describe('KeyValueCell valueAccessory', () => {
  it('shows the accessory in the value position instead of the value text, and still says the value to a screen reader', () => {
    const t = render(<KeyValueCell keyLabel="Connection" value="Online" valueAccessory={<Text>ONLINE TAG</Text>} />);
    expect(texts(t)).toEqual(['Connection', 'ONLINE TAG']);
    expect(t.root.findAll(node => node.props.accessibilityLabel === 'Connection, Online').length).toBeGreaterThan(0);
  });

  it('shows the value text when there is no accessory', () => {
    const t = render(<KeyValueCell keyLabel="Connection" value="Online" />);
    expect(texts(t)).toEqual(['Connection', 'Online']);
  });
});

describe('ui/SectionHeader inset', () => {
  const sidePadding = (inset?: boolean) => {
    const t = render(<SectionHeader title="Details" testID="section" {...(inset === undefined ? {} : { inset })} />);
    const container = t.root.findAll(node => node.props.testID === 'section' && typeof node.type === 'string')[0];
    const padding = StyleSheet.flatten(container.props.style).paddingHorizontal;
    act(() => t.unmount());
    tree = undefined;
    return padding;
  };

  it('pads its sides by default', () => {
    expect(sidePadding()).toBeGreaterThan(0);
    expect(sidePadding(true)).toBeGreaterThan(0);
  });

  it('has no side padding with inset={false}, for use inside a container that pads its content', () => {
    expect(sidePadding(false)).toBe(0);
  });
});

describe('detail tab bar', () => {
  const tabs = [
    { key: 'overview', label: 'Overview', icon: TAB_ICONS.overview },
    { key: 'items', label: 'Items', icon: TAB_ICONS.items },
    { key: 'dispatches', label: 'Dispatches', icon: TAB_ICONS.dispatches },
  ];

  it('has marginCompact at both ends of the scrolling row, so the next tab shows past the edge at large text', () => {
    const t = render(<GenericDetailTabNavigator tabs={tabs} activeTab="overview" onTabChange={jest.fn()} />);
    const content = StyleSheet.flatten(t.root.findByType(ScrollView).props.contentContainerStyle);
    expect(content.paddingHorizontal).toBe(layout.marginCompact);
  });

  it('sizes each tab to its label: no fixed width, a minimum, and side padding of space.md', () => {
    const t = render(<GenericDetailTabNavigator tabs={tabs} activeTab="overview" onTabChange={jest.fn()} />);
    const tab = t.root.findAll(node => (node.type as unknown) === 'View' && node.props.accessibilityRole === 'tab')[0];
    const style = StyleSheet.flatten(tab.props.style);
    expect(style.width).toBeUndefined();
    expect(style.minWidth).toBe(64);
    expect(style.paddingHorizontal).toBe(space.md);
  });
});
