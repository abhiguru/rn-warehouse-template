import React from 'react';
import { registerSampleBrand, SAMPLE_BRAND } from '@/tests/helpers/sampleBrand';

registerSampleBrand(); // Orange plus the fictional sample brand (WH-141)
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
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

async function renderIn(
  brand: (typeof BRANDS)[number],
  mode: Mode,
  isEditMode = false,
  invoiceData: React.ComponentProps<typeof InvoiceSuccessDialog>['invoiceData'] = invoice
) {
  mockState = { theme: { preference: mode, brand } };
  return render(
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
}

// The scrim and the sheet are plain Views with no role, label or text of their own, so their background colours can
// only be found by walking the rendered tree.
type Node = NonNullable<typeof screen.root>;
function backgrounds(): (string | undefined)[] {
  const found: (string | undefined)[] = [];
  const walk = (node: Node) => {
    if (typeof node.type === 'string' && node.type === 'View') found.push(StyleSheet.flatten(node.props.style)?.backgroundColor);
    for (const child of node.children) if (typeof child !== 'string') walk(child as Node);
  };
  walk(screen.root as Node);
  return found;
}

describe('InvoiceSuccessDialog', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders on the sheet surface over the scrim with the formatted total', async () => {
      const tokens = getTokens(brand, mode);
      await renderIn(brand, mode);
      expect(backgrounds()).toContain(tokens.overlay.scrim);
      expect(backgrounds()).toContain(tokens.surface.sheet);
      expect(screen.getByText('Invoice saved')).toBeOnTheScreen();
      expect(screen.getByText('₹1,23,456.50')).toBeOnTheScreen();
      expect(screen.getByText('View invoices')).toBeOnTheScreen();
      expect(screen.getByText('Create another invoice')).toBeOnTheScreen();
    });
  });

  it('uses update wording in edit mode and hides the redundant "another" action', async () => {
    await renderIn(SAMPLE_BRAND, 'dark', true);
    expect(screen.getByText('Invoice updated')).toBeOnTheScreen();
    expect(screen.getByText('View invoice')).toBeOnTheScreen();
    expect(screen.queryByText('View invoices')).not.toBeOnTheScreen();
    expect(screen.queryByText('Edit another invoice')).not.toBeOnTheScreen();
    expect(screen.queryByText('Create another invoice')).not.toBeOnTheScreen();
  });

  describe('a failure of the sharing', () => {
    const renderWith = async (shareError?: string | null) => {
      mockState = { theme: { preference: 'light', brand: 'orange' } };
      return render(
        <InvoiceSuccessDialog
          isVisible
          invoiceData={invoice}
          onCreateAnother={jest.fn()}
          onViewList={jest.fn()}
          onSharePDF={jest.fn()}
          shareError={shareError}
        />
      );
    };

    it('is drawn inside the dialog, as an alert the screen reader announces', async () => {
      await renderWith("Couldn't share the PDF. Try again.");

      // The strip is a plain View (not an accessible element), so no role query reaches it: found by its testID.
      const strip = screen.getByTestId('invoice-share-error');
      expect(strip).toHaveProp('accessibilityRole', 'alert');
      expect(strip).toHaveProp('accessibilityLiveRegion', 'polite');
      expect(screen.getByText("Couldn't share the PDF. Try again.")).toBeOnTheScreen();
    });

    it('leaves no strip when there is no failure', async () => {
      await renderWith(null);

      expect(screen.queryByTestId('invoice-share-error')).not.toBeOnTheScreen();
    });
  });

  describe('the total it shows', () => {
    it('is the stored total, with a note when it differs from the estimate shown before saving', async () => {
      // The form estimated 735; the server counted 1.5 periods and stored 998.
      await renderIn('orange', 'light', false, { ...invoice, total: 998, estimated_total: 735 });

      expect(screen.getByText('₹998.00')).toBeOnTheScreen();
      expect(screen.queryByText('₹735.00')).not.toBeOnTheScreen();
      expect(screen.getByText('The total saved by the server differs from the estimate of ₹735.00 shown before saving.')).toBeOnTheScreen();
    });

    it('has no note when the stored total is the estimate', async () => {
      await renderIn('orange', 'light', false, { ...invoice, total: 998, estimated_total: 998 });

      expect(screen.getByText('₹998.00')).toBeOnTheScreen();
      expect(screen.queryByText(/differs/)).not.toBeOnTheScreen();
    });

    it('is left out, not replaced by the estimate, when the stored total could not be read', async () => {
      await renderIn('orange', 'light', false, { ...invoice, total: null, estimated_total: 735 });

      expect(screen.getByText('The saved total could not be read. Open the invoice to see it.')).toBeOnTheScreen();
      expect(screen.queryByText('₹735.00')).not.toBeOnTheScreen();
      expect(screen.queryByText('₹0.00')).not.toBeOnTheScreen();
    });
  });
});
