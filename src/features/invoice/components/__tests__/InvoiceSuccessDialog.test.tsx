import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { InvoiceSuccessDialog } from '../InvoiceSuccessDialog';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const MODES: Mode[] = ['light', 'dark'];

const invoice = {
  invoice_id: 'inv-1',
  invoice_no: 42,
  fin_year: '2026-27',
  customer_name: 'Fictional Traders',
  total: 123456.5,
};

function renderIn(brand: (typeof BRANDS)[number], mode: Mode, isEditMode = false) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <InvoiceSuccessDialog
        isVisible
        invoiceData={invoice}
        onCreateAnother={jest.fn()}
        onViewList={jest.fn()}
        onPrint={jest.fn()}
        onSharePDF={jest.fn()}
        isEditMode={isEditMode}
      />
    );
  });
  return tree;
}

function allText(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).join(''));
}

describe('InvoiceSuccessDialog', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders on the sheet surface over the scrim with the formatted total', () => {
      const tokens = getTokens(brand, mode);
      const tree = renderIn(brand, mode);
      const views = tree.root.findAll(node => (node.type as unknown) === 'View');
      const backgrounds = views.map(v => StyleSheet.flatten(v.props.style)?.backgroundColor);
      expect(backgrounds).toContain(tokens.overlay.scrim);
      expect(backgrounds).toContain(tokens.surface.sheet);
      const text = allText(tree);
      expect(text).toContain('Invoice saved');
      expect(text).toContain('₹1,23,456.50');
      expect(text).toContain('View invoices');
      expect(text).toContain('Create another invoice');
    });
  });

  it('uses update wording in edit mode and hides the redundant "another" action', () => {
    const text = allText(renderIn('gcsa', 'dark', true));
    expect(text).toContain('Invoice updated');
    expect(text).toContain('View invoices');
    expect(text).not.toContain('Edit another invoice');
    expect(text).not.toContain('Create another invoice');
  });
});
