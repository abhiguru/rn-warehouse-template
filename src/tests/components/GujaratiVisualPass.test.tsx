/**
 * Defects found by the device pass of the Gujarati version (2026-10-10), as tests.
 *
 *  - Document numbers are identifiers: shown in 0-9 on the list cards, also when
 *    the data holds them as numbers (the invoice number is a number).
 *  - A financial year is a period: shown in the language's digits.
 *  - Every tab of the GRN, dispatch and invoice pages has an icon that the bundled
 *    icon font can draw, whatever the language.
 *  - Report rows give each fact its own line in Gujarati and one joined line in English.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { MemoizedInvoiceItem } from '@/components/list-items/MemoizedInvoiceItem';
import { MemoizedDispatchItem } from '@/components/list-items/MemoizedDispatchItem';
import { RecentDispatchedOrderCard } from '@/components/list-items/RecentDispatchedOrderCard';
import { GRNTabNavigator } from '@/components/grn-details/GRNTabNavigator';
import { DispatchTabNavigator } from '@/components/dispatch-details/DispatchTabNavigator';
import { InvoiceTabNavigator } from '@/components/invoice-details/InvoiceTabNavigator';
import { TAB_ICONS } from '@/components/common/GenericDetailTabNavigator';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
import { KPICard } from '@/components/reports/KPICard';
import { KPIGrid } from '@/components/reports/KPIGrid';
import { singleLineText, trackedText } from '@/theme/tokens';
import { formatFinancialYear } from '@/utils/formatters';
import type { Invoice } from '@/services/invoice-service';
import type { Dispatch } from '@/services/dispatch-service';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';

// The glyphs of the icon font the app is built with (Expo's copy of MaterialCommunityIcons).
const GLYPHS: Record<string, number> = jest.requireActual(
  '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'
);

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: { View }, FadeIn: { duration: () => undefined } };
});

const GUJARATI_DIGIT = /[૦-૯]/;

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

const flatten = (children: unknown): string =>
  React.Children.toArray(children as React.ReactNode)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : React.isValidElement(child) ? flatten((child.props as { children?: unknown }).children) : ''))
    .join('');

/** The text of every host Text, nested highlights included. */
const texts = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => flatten(node.props.children));

const labels = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);

const iconNames = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll(node => (node.type as unknown) === 'Icon').map(node => node.props.name as string);

// The data holds the numbers as numbers, as the backend sends the invoice number.
const invoice = {
  invoice_id: 'fictional-invoice',
  invoice_number: 53,
  invoice_date: '2026-10-10',
  total: 200,
  tax_amount: 10,
  labour: 0,
  discount: 0,
  financial_year: '2027-2028',
  is_auto_generated: false,
  customer: { name: 'Lakeview Spices' },
  grn: { gr_no: 12 },
} as unknown as Invoice;

const dispatch = {
  dispatch_id: 'd1',
  disp_no: 207,
  disp_date: '2026-10-09',
  customer_name: 'Hilltop Fresh Mart',
  total_qty: 5,
  total_weight: 200,
  total_items: 1,
  registration: 'GJ01AB1234',
  items: [{ grn_item_id: 'g1', item_name: 'Dry Red Chillies', rack: 'E2', weight: 40, gr_no: 6, grn_qty: 100, disp_qty: 5 }],
} as unknown as Dispatch;

const recent = {
  dispatch_id: 'd2',
  disp_no: 43,
  disp_date: '2026-10-09',
  customer_id: 'c1',
  customer_name: 'Hilltop Fresh Mart',
  order_id: 'o1',
  order_no: 1042,
  item_count: 1,
  total_qty: 1,
  registration: null,
  created_by_name: 'Asha',
  items: [],
} as unknown as RecentDispatchedOrder;

afterEach(() => setLanguage('en'));

describe('document numbers on the list cards in Gujarati', () => {
  beforeEach(() => setLanguage('gu'));

  it('the invoice card shows the invoice number in 0-9 in its title and its spoken label', () => {
    const tree = render(<MemoizedInvoiceItem invoice={invoice} onPress={jest.fn()} />);
    expect(texts(tree)).toContain('ઇન્વૉઇસ 53');
    expect(texts(tree)).not.toContain('ઇન્વૉઇસ ૫૩');
    const label = labels(tree).find(text => text.includes('Lakeview Spices'));
    expect(label).toContain('ઇન્વૉઇસ 53,');
    expect(label).toContain('આવક પાવતી 12');
    // Amounts and the date stay in Gujarati digits.
    expect(label).toContain('₹૨૦૦.૦૦');
    expect(texts(tree)).toContain('૧૦ ઑક્ટો');
  });

  it('the invoice card shows the financial year in Gujarati digits', () => {
    const tree = render(<MemoizedInvoiceItem invoice={invoice} onPress={jest.fn()} />);
    expect(texts(tree)).toContain('નાણાકીય વર્ષ ૨૦૨૭-૨૦૨૮');
  });

  // The guard: whatever a card adds later, the line that names the document has no Gujarati digit.
  it.each([
    ['invoice', () => <MemoizedInvoiceItem invoice={invoice} onPress={jest.fn()} />, 'ઇન્વૉઇસ 53'],
    ['dispatch', () => <MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} />, 'જાવક 207'],
    ['recent dispatch', () => <RecentDispatchedOrderCard dispatch={recent} onPress={jest.fn()} />, 'જાવક 43'],
  ])('the %s card names its document in 0-9', (_name, element, title) => {
    const tree = render(element());
    expect(texts(tree)).toContain(title);
    const spoken = labels(tree).find(text => text.startsWith(title));
    expect(spoken).toBeDefined();
    expect(GUJARATI_DIGIT.test(title)).toBe(false);
  });

  it('the dispatch card keeps the vehicle number as stored and the counts in Gujarati digits', () => {
    const tree = render(<MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} />);
    const label = labels(tree).find(text => text.startsWith('જાવક 207'));
    expect(label).toContain('GJ01AB1234');
    expect(label).toContain('૧ આઇટમ');
  });
});

describe('financial year', () => {
  it('uses the digits of the language, for both forms the app holds', () => {
    expect(formatFinancialYear('2026-27')).toBe('2026-27');
    setLanguage('gu');
    expect(formatFinancialYear('2026-27')).toBe('૨૦૨૬-૨૭');
    expect(formatFinancialYear('2027-2028')).toBe('૨૦૨૭-૨૦૨૮');
    expect(formatFinancialYear(2026)).toBe('૨૦૨૬');
    expect(formatFinancialYear(null)).toBe('');
  });
});

describe('tab icons on the details pages', () => {
  const navigators: [string, (tab: string) => React.ReactElement, string[]][] = [
    ['GRN', tab => <GRNTabNavigator activeTab={tab as never} onTabChange={jest.fn()} item_count={2} dispatch_count={1} image_count={1} invoice_count={1} />, ['overview', 'items', 'dispatches', 'images', 'invoices']],
    ['dispatch', tab => <DispatchTabNavigator activeTab={tab as never} onTabChange={jest.fn()} item_count={2} grn_count={1} image_count={1} invoice_count={1} />, ['overview', 'items', 'grns', 'images', 'invoices']],
    ['invoice', tab => <InvoiceTabNavigator active_tab={tab as never} on_tab_change={jest.fn()} item_count={2} />, ['overview', 'items', 'breakdown']],
  ];

  it('every icon of the table is a glyph of the icon font, and none is the solid receipt', () => {
    for (const icon of Object.values(TAB_ICONS)) {
      for (const name of [icon.filled, icon.outline]) {
        expect({ name, known: name in GLYPHS }).toEqual({ name, known: true });
        // `receipt` is a solid block in this font: it showed as a grey square on the phone.
        expect(name).not.toBe('receipt');
      }
    }
  });

  it.each(navigators)('the %s page gives every tab the same known icon in English and Gujarati', (_name, element, tabs) => {
    for (const active of tabs) {
      setLanguage('en');
      const english = iconNames(render(element(active)));
      setLanguage('gu');
      const gujarati = iconNames(render(element(active)));
      expect(gujarati).toHaveLength(tabs.length);
      expect(gujarati).toEqual(english);
      for (const name of gujarati) expect({ name, known: name in GLYPHS }).toEqual({ name, known: true });
    }
  });
});

describe('report rows', () => {
  const card = () => (
    <ReportCustomerCard title="Green Valley Traders" subtitle={['Average age 351 days', '2 over 1 year']} value={120} valueLabel="units" onPress={jest.fn()} />
  );

  it('English keeps the facts on one line', () => {
    const tree = render(card());
    expect(texts(tree)).toContain('Average age 351 days · 2 over 1 year');
  });

  it('Gujarati gives each fact its own line, so no fact loses its last word', () => {
    setLanguage('gu');
    const tree = render(card());
    expect(texts(tree)).toEqual(expect.arrayContaining(['Average age 351 days', '2 over 1 year']));
    expect(texts(tree)).not.toContain('Average age 351 days · 2 over 1 year');
    // The spoken label still reads them as one sentence.
    expect(labels(tree)[0]).toContain('Average age 351 days · 2 over 1 year');
  });

  it('four compact KPI tiles make two rows of two', () => {
    // A 1080 px wide phone is about 392 dp wide.
    const before = Dimensions.get('window');
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
    const items = ['a', 'b', 'c', 'd'].map(label => ({ icon: 'warehouse', value: 1, label }));
    const tree = render(<KPIGrid items={items} compact />);
    const perRow = new Map<unknown, number>();
    for (const tile of tree.root.findAllByType(KPICard)) perRow.set(tile.parent, (perRow.get(tile.parent) ?? 0) + 1);
    act(() => tree.unmount());
    Dimensions.set({ window: before });
    expect([...perRow.values()]).toEqual([2, 2]);
  });
});

describe('text helpers of the theme', () => {
  it('letter spacing is kept in English and removed in Gujarati', () => {
    expect(trackedText(0.5)).toBe(0.5);
    setLanguage('gu');
    expect(trackedText(0.5)).toBe(0);
  });

  it('a short Gujarati text is held to one line that may shrink; English gets no props', () => {
    expect(singleLineText()).toEqual({});
    setLanguage('gu');
    expect(singleLineText()).toEqual({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85 });
  });
});
