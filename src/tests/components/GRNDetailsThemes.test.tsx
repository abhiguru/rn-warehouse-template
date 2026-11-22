import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { GRNHeroHeader } from '@/components/grn-details/GRNHeroHeader';
import { GRNItemsTab } from '@/components/grn-details/GRNItemsTab';
import { GRNImagesTab } from '@/components/grn-details/GRNImagesTab';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 891, scale: 2.6, fontScale: 1 }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
// The Images tab reads the connection; the native NetInfo module is absent under Jest, so the connection is faked online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true, isInternetReachable: true }), addEventListener: () => () => undefined },
}));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

async function show(element: React.ReactElement, brand: string, mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  await render(element);
}

/** The background colours of every drawn view except the open bar; styles have no query, so the rendered tree is walked. */
function backgroundsExceptOpenBar(): unknown[] {
  return [screen.root!, ...screen.root!.queryAll(() => true)]
    .filter(n => typeof n.type === 'string' && n.props.testID !== 'table-open-bar')
    .map(n => StyleSheet.flatten(n.props.style)?.backgroundColor)
    .filter(Boolean);
}

describe.each(THEMES)('GRN details in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders the hero header on surface.card with a worded stock status', async () => {
    await show(
      <GRNHeroHeader gr_no="Z0797" date="2026-10-09" total_qty={100} total_stock={10} total_dispatched={90} customer_name="Patel Traders" />,
      brand,
      mode
    );
    expect(screen.root).toHaveStyle({ backgroundColor: t.surface.card });
    expect(screen.getByText('Z0797')).toBeOnTheScreen();
    // A no-break space keeps a number with its unit on screen; a plain space matches it here.
    expect(screen.getByText('Patel Traders · 09/10/26')).toBeOnTheScreen();
    expect(screen.getByText('Low stock')).toBeOnTheScreen();
    expect(screen.getByLabelText('Low stock')).toHaveStyle({ backgroundColor: t.status.critical.background });
  });

  it('renders an item row with tokens and a status word', async () => {
    await show(
      <GestureHandlerRootView><GRNItemsTab items={[{ id: 'l1', item_name: 'Potato', qty: 120, stock: 0, weight: 1250.5, rack: 'B-14', package_mark: 'PT' }]} /></GestureHandlerRootView>,
      brand,
      mode
    );
    // Everything dispatched is the normal end of a GRN: In stock reads 0, no error tag
    expect(screen.queryByText('Out of stock')).not.toBeOnTheScreen();
    expect(screen.queryByText('Low stock')).not.toBeOnTheScreen();
    // The weight of one package, after the mark.
    expect(screen.getByText(/^PT · 1,250\.5\skg each$/)).toBeOnTheScreen();
    expect(screen.queryByText(/1,250\.5\skg$/)).not.toBeOnTheScreen();
    await userEvent.press(screen.getByTestId('grn-item-row-l1'));
    // The tag shows the value alone (icon and value); the screen reader keeps the word.
    expect(screen.getByText('B-14')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Rack B-14').length).toBeGreaterThan(0);
    // The open row's accent bar is the one brand-coloured fill (table.accent); no row or card is.
    expect(screen.getAllByTestId('table-open-bar')).toHaveLength(1);
    const backgrounds = backgroundsExceptOpenBar();
    expect(backgrounds).toEqual(expect.arrayContaining([t.surface.card, t.background.base]));
    expect(backgrounds).not.toContain(t.brand.fill);
  });

  it('renders the items empty state and the images grid', async () => {
    await show(<GRNItemsTab items={[]} />, brand, mode);
    expect(screen.getByText('No items')).toBeOnTheScreen();
    await screen.unmount();

    await show(
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
    expect(screen.getByLabelText('Delete photo of Potato')).toBeOnTheScreen();
    expect(screen.getByLabelText('All, 2 images').props.accessibilityState).toEqual({ selected: true });
  });
});
