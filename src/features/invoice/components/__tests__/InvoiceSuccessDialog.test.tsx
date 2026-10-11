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

function renderIn(
  brand: (typeof BRANDS)[number],
  mode: Mode,
  isEditMode = false,
  invoiceData: React.ComponentProps<typeof InvoiceSuccessDialog>['invoiceData'] = invoice
) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <InvoiceSuccessDialog
        isVisible
        invoiceData={invoiceData}
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

  describe('the total it shows', () => {
    it('is the stored total, with a note when it differs from the estimate shown before saving', () => {
      // The form estimated 735; the server counted 1.5 periods and stored 998.
      const text = allText(renderIn('orange', 'light', false, { ...invoice, total: 998, estimated_total: 735 }));

      expect(text).toContain('₹998.00');
      expect(text).not.toContain('₹735.00');
      expect(text).toContain('The total saved by the server differs from the estimate of ₹735.00 shown before saving.');
    });

    it('has no note when the stored total is the estimate', () => {
      const text = allText(renderIn('orange', 'light', false, { ...invoice, total: 998, estimated_total: 998 }));

      expect(text).toContain('₹998.00');
      expect(text.some((line) => line.includes('differs'))).toBe(false);
    });

    it('is left out, not replaced by the estimate, when the stored total could not be read', () => {
      const text = allText(renderIn('orange', 'light', false, { ...invoice, total: null, estimated_total: 735 }));

      expect(text).toContain('The saved total could not be read. Open the invoice to see it.');
      expect(text).not.toContain('₹735.00');
      expect(text).not.toContain('₹0.00');
    });
  });
});
