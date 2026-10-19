/** The items editor in the four themes (Orange and GCSA, light and dark), in a new invoice and in an edit. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, type Mode } from '@/theme/tokens';
import { makeInvoiceStore, fillNewInvoice, openForEdit, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, inputOf, textsOf, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';

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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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
      let tree!: ReactTestRenderer;
      await act(async () => { tree = create(<ConnectedEditor />); });
      await openAllGroups(tree);
      const texts = textsOf(tree);
      expect(texts).toContain('₹735.00');
      expect(texts).toContain('₹1,470.00');
      expect(inputOf(tree, 'cell|edit_0_0|charge').props.value).toBe('5.00');
      await act(async () => { tree.unmount(); });
    });
  });
});
