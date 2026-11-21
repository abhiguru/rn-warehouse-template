/** The items editor in the four themes (Orange and the sample brand, light and dark), in a new invoice and in an edit. */
import React from 'react';
import { registerSampleBrand, SAMPLE_BRAND } from '@/tests/helpers/sampleBrand';

registerSampleBrand(); // Orange plus the fictional sample brand (WH-141)
import { render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, type Mode } from '@/theme/tokens';
import { makeInvoiceStore, fillNewInvoice, openForEdit, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor } from '@/tests/helpers/invoiceItemsHarness';

let mockStore: InvoiceStore;
let mockFontScale = 1;
let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => {
  const real = require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore);
  return {
    ...real,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      real.useAppSelector((state: object) => selector({ ...state, theme: mockTheme })),
  };
});
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: mockFontScale }),
}));

const MODES: Mode[] = ['light', 'dark'];

describe.each(BRANDS.flatMap((brand) => MODES.map((mode) => [brand, mode] as const)))('%s %s', (brand, mode) => {
  describe.each([['create'], ['edit']] as const)('%s', (kind) => {
    it.each([[1], [1.3]])('draws the cards with Indian-formatted amounts at font scale %s', async (scale) => {
      mockTheme = { preference: mode, brand };
      mockFontScale = scale;
      mockStore = makeInvoiceStore();
      if (kind === 'create') fillNewInvoice(mockStore, groupLines(2));
      else openForEdit(mockStore, groupLines(2));
      await render(<ConnectedEditor />);
      // A user opens each closed card with its "Show dispatch details" button.
      for (const toggle of screen.getAllByRole('button', { expanded: false })) await userEvent.press(toggle);
      expect(screen.getAllByText('₹735.00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('₹1,470.00').length).toBeGreaterThan(0);
      expect(screen.getByTestId('cell|edit_0_0|charge')).toHaveDisplayValue('5.00');
    });
  });
});
