/** The tab bar scrolls the selected tab into view and never truncates a label. */
import React from 'react';
import { ScrollView } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GenericDetailTabNavigator, TAB_ICONS } from '../GenericDetailTabNavigator';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const tabs = [
  { key: 'overview', label: 'Overview', icon: TAB_ICONS.overview },
  { key: 'items', label: 'Items', icon: TAB_ICONS.items, badgeCount: 3 },
  { key: 'dispatches', label: 'Dispatches', icon: TAB_ICONS.dispatches },
  { key: 'images', label: 'Images', icon: TAB_ICONS.images },
  { key: 'invoices', label: 'Invoices', icon: TAB_ICONS.invoices, badgeCount: 2 },
];
const layout = (x: number, width: number) => ({ nativeEvent: { layout: { x, y: 0, width, height: 60 } } });

let tree: ReactTestRenderer;
afterEach(() => act(() => tree?.unmount()));

const mount = (active: string) => {
  act(() => {
    tree = create(<GenericDetailTabNavigator tabs={tabs} activeTab={active} onTabChange={jest.fn()} />);
  });
  const scrollTo = jest.fn();
  (tree.root.findByType(ScrollView).instance as unknown as { scrollTo: jest.Mock }).scrollTo = scrollTo;
  const scroll = tree.root.findByType(ScrollView);
  const tabNodes = tree.root.findAll(n => (n.type as unknown) === 'View' && n.props.accessibilityRole === 'tab' && typeof n.props.onLayout === 'function');
  return { scrollTo, scroll, tabNodes };
};

describe('GenericDetailTabNavigator', () => {
  it('scrolls the last tab into view when the bar first lays out with it selected', () => {
    const { scrollTo, scroll, tabNodes } = mount('invoices');
    act(() => {
      scroll.props.onLayout(layout(0, 411));
      tabNodes.forEach((n, i) => n.props.onLayout(layout(i * 110, 110)));
    });
    // invoices: x 440, width 110, centre 495; viewport 411 -> offset 289.5
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 289.5, animated: true });
  });

  it('does not scroll a first tab that is already visible', () => {
    const { scrollTo, scroll, tabNodes } = mount('overview');
    act(() => {
      scroll.props.onLayout(layout(0, 411));
      tabNodes.forEach((n, i) => n.props.onLayout(layout(i * 110, 110)));
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
  });

  it('scrolls to the new tab when the selection changes', () => {
    const { scrollTo, scroll, tabNodes } = mount('overview');
    act(() => {
      scroll.props.onLayout(layout(0, 411));
      tabNodes.forEach((n, i) => n.props.onLayout(layout(i * 110, 110)));
    });
    act(() => {
      tree.update(<GenericDetailTabNavigator tabs={tabs} activeTab="invoices" onTabChange={jest.fn()} />);
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 289.5, animated: true });
  });

  it('keeps every label on one line without a truncation limit that cuts it', () => {
    mount('invoices');
    const labels = tree.root.findAll(n => (n.type as unknown) === 'Text' && tabs.some(t => t.label === n.props.children));
    expect(labels).toHaveLength(5);
    labels.forEach(l => expect(l.props.numberOfLines).toBe(1));
  });
});

describe('tab label growth cap', () => {
  it('caps the labels at 1.5x', () => {
    mount('items');
    const labels = tree.root.findAll(n => (n.type as unknown) === 'Text' && tabs.some(t => t.label === n.props.children));
    labels.forEach(l => expect(l.props.maxFontSizeMultiplier).toBe(1.5));
  });
});
