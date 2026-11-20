/** The tab bar scrolls the selected tab into view and never truncates a label. */
import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GenericDetailTabNavigator, TAB_ICONS } from '../GenericDetailTabNavigator';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const tabs = [
  { key: 'overview', label: 'Overview', icon: TAB_ICONS.overview },
  { key: 'items', label: 'Items', icon: TAB_ICONS.items, badgeCount: 3 },
  { key: 'dispatches', label: 'Dispatches', icon: TAB_ICONS.dispatches },
  { key: 'images', label: 'Images', icon: TAB_ICONS.images },
  { key: 'invoices', label: 'Invoices', icon: TAB_ICONS.invoices, badgeCount: 2 },
];
type HostElement = ReturnType<typeof screen.getByRole>;
const layout = (x: number, width: number) => ({ nativeEvent: { layout: { x, y: 0, width, height: 60 } } });

// The jest ScrollView keeps one shared scrollTo stand-in on its prototype.
const scrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;
beforeEach(() => scrollTo.mockClear());

const element = (active: string) => <GenericDetailTabNavigator tabs={tabs} activeTab={active} onTabChange={jest.fn()} />;

const mount = async (active: string) => {
  const view = await render(element(active));
  // The scroll view is the only child of the tab list (the root); it has no role or text to query by.
  const scroll = screen.root!.children[0] as HostElement;
  return { ...view, scroll };
};

/** The bar lays out 411 wide, then every tab 110 wide, as a phone reports it. */
const layOut = async (scroll: HostElement) => {
  await fireEvent(scroll, 'layout', layout(0, 411));
  for (const [i, node] of screen.getAllByRole('tab').entries()) await fireEvent(node, 'layout', layout(i * 110, 110));
};

describe('GenericDetailTabNavigator', () => {
  it('scrolls the last tab into view when the bar first lays out with it selected', async () => {
    const { scroll } = await mount('invoices');
    await layOut(scroll);
    // invoices: x 440, width 110, centre 495; viewport 411 -> offset 289.5
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 289.5, animated: true });
  });

  it('does not scroll a first tab that is already visible', async () => {
    const { scroll } = await mount('overview');
    await layOut(scroll);
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
  });

  it('scrolls to the new tab when the selection changes', async () => {
    const { scroll, rerender } = await mount('overview');
    await layOut(scroll);
    await rerender(element('invoices'));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 289.5, animated: true });
  });

  it('keeps every label on one line without a truncation limit that cuts it', async () => {
    await mount('invoices');
    for (const { label } of tabs) expect(screen.getByText(label)).toHaveProp('numberOfLines', 1);
  });
});

describe('tab label growth cap', () => {
  it('caps the labels at 1.5x', async () => {
    await mount('items');
    for (const { label } of tabs) expect(screen.getByText(label)).toHaveProp('maxFontSizeMultiplier', 1.5);
  });
});
