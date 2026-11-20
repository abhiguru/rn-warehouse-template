/**
 * WH-216: the shared parts the object pages are built from: KeyValueCell with a node in the value
 * position (valueAccessory), ui/SectionHeader with and without its side inset, and the detail tab
 * bar that sizes its tabs to their labels and scrolls with marginCompact at both ends.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { KeyValueCell } from '../fiori/KeyValueCell';
import { SectionHeader } from '../ui/SectionHeader';
import { GenericDetailTabNavigator, TAB_ICONS } from '../common/GenericDetailTabNavigator';
import { layout, space } from '@/theme/tokens';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

describe('KeyValueCell valueAccessory', () => {
  it('shows the accessory in the value position instead of the value text, and still says the value to a screen reader', async () => {
    await render(<KeyValueCell keyLabel="Connection" value="Online" valueAccessory={<Text>ONLINE TAG</Text>} />);
    expect(screen.getByText('Connection')).toBeOnTheScreen();
    expect(screen.getByText('ONLINE TAG')).toBeOnTheScreen();
    expect(screen.queryByText('Online')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Connection, Online')).toBeOnTheScreen();
  });

  it('shows the value text when there is no accessory', async () => {
    await render(<KeyValueCell keyLabel="Connection" value="Online" />);
    expect(screen.getByText('Connection')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();
    expect(screen.queryByText('ONLINE TAG')).not.toBeOnTheScreen();
  });
});

describe('ui/SectionHeader inset', () => {
  const sidePadding = async (inset?: boolean) => {
    await render(<SectionHeader title="Details" testID="section" {...(inset === undefined ? {} : { inset })} />);
    return StyleSheet.flatten(screen.getByTestId('section').props.style).paddingHorizontal;
  };

  it('pads its sides by default', async () => {
    expect(await sidePadding()).toBeGreaterThan(0);
  });

  it('pads its sides with inset={true}', async () => {
    expect(await sidePadding(true)).toBeGreaterThan(0);
  });

  it('has no side padding with inset={false}, for use inside a container that pads its content', async () => {
    expect(await sidePadding(false)).toBe(0);
  });
});

describe('detail tab bar', () => {
  const tabs = [
    { key: 'overview', label: 'Overview', icon: TAB_ICONS.overview },
    { key: 'items', label: 'Items', icon: TAB_ICONS.items },
    { key: 'dispatches', label: 'Dispatches', icon: TAB_ICONS.dispatches },
  ];

  it('has marginCompact at both ends of the scrolling row, so the next tab shows past the edge at large text', async () => {
    await render(<GenericDetailTabNavigator tabs={tabs} activeTab="overview" onTabChange={jest.fn()} />);
    // The tabs sit in the scroll view's content container; the host scroll view carries its style.
    const scroller = screen.getByRole('tab', { name: 'Overview' }).parent?.parent;
    const content = StyleSheet.flatten(scroller?.props.contentContainerStyle);
    expect(content.paddingHorizontal).toBe(layout.marginCompact);
  });

  it('sizes each tab to its label: no fixed width, a minimum, and side padding of space.md', async () => {
    await render(<GenericDetailTabNavigator tabs={tabs} activeTab="overview" onTabChange={jest.fn()} />);
    for (const label of ['Overview', 'Items', 'Dispatches']) {
      const style = StyleSheet.flatten(screen.getByRole('tab', { name: label }).props.style);
      expect(style.width).toBeUndefined();
      expect(style.minWidth).toBe(64);
      expect(style.paddingHorizontal).toBe(space.md);
    }
  });
});
