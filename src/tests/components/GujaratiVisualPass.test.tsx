/**
 * Defects found by the device pass of the Gujarati version (2026-10-10), as tests.
 *
 *  - Document numbers are identifiers: shown in 0-9 on the list cards, also when
 *    the data holds them as numbers (the invoice number is a number).
 *  - A financial year is a period: shown in the language's digits.
 *  - Every tab of the GRN, dispatch, invoice and customer pages has an icon that the bundled
 *    icon font can draw, whatever the language.
 *  - Report rows give each fact its own line in Gujarati and one joined line in English.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { MemoizedInvoiceItem } from '@/components/list-items/MemoizedInvoiceItem';
import { MemoizedDispatchItem } from '@/components/list-items/MemoizedDispatchItem';
import { RecentDispatchedOrderCard } from '@/components/list-items/RecentDispatchedOrderCard';
import { GRNTabNavigator } from '@/components/grn-details/GRNTabNavigator';
import { DispatchTabNavigator } from '@/components/dispatch-details/DispatchTabNavigator';
import { InvoiceTabNavigator } from '@/components/invoice-details/InvoiceTabNavigator';
import { CustomerTabNavigator } from '@/components/customer-details/CustomerTabNavigator';
import { TAB_ICONS } from '@/components/common/GenericDetailTabNavigator';
import { ReportCustomerCard } from '@/components/reports/ReportCustomerCard';
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// The cards import the Print swipe, which needs the real gesture and animation libraries; no card here is printable.
jest.mock('@/components/list-items/PrintSwipe', () => ({ PrintSwipe: ({ children }: { children: unknown }) => children }));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: { View }, FadeIn: { duration: () => undefined }, useReducedMotion: () => false };
});

const GUJARATI_DIGIT = /[૦-૯]/;

type Host = ReturnType<typeof screen.getByText>;
/** Every host element below one, in order (the "Icon" stand-in has no role, label or text to query by). */
const below = (node: Host): Host[] => node.children.flatMap(child => (!child || typeof child === 'string' ? [] : [child as Host, ...below(child as Host)]));

const flatten = (children: unknown): string =>
  React.Children.toArray(children as React.ReactNode)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : React.isValidElement(child) ? flatten((child.props as { children?: unknown }).children) : ''))
    .join('');

// The text of every host Text, nested highlights included. A check that something is NOT drawn
// must also see a Text that is mounted but hidden.
const texts = (hidden = false): string[] =>
  screen.queryAllByText(/^/, { includeHiddenElements: hidden }).map(node => flatten(node.props.children));

const labels = (hidden = false): string[] =>
  screen.queryAllByLabelText(/^/, { includeHiddenElements: hidden })
    .map(node => node.props.accessibilityLabel)
    .filter((label): label is string => typeof label === 'string');

const iconNames = (): string[] =>
  [screen.root as Host, ...below(screen.root as Host)].filter(node => (node.type as unknown) === 'Icon').map(node => node.props.name as string);

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

afterEach(() => {
  setLanguage('en');
});

describe('document numbers on the list cards in Gujarati', () => {
  beforeEach(() => setLanguage('gu'));

  it('the invoice card shows the invoice number in 0-9 in its title and its spoken label', async () => {
    await render(<MemoizedInvoiceItem invoice={invoice} onPress={jest.fn()} />);
    // The title is the number alone (the card says what it is by its place in the list); the spoken label names the document.
    expect(texts()).toContain('53');
    expect(texts(true)).not.toContain('૫૩');
    const label = labels().find(text => text.includes('Lakeview Spices'));
    expect(label).toContain('ઇન્વૉઇસ 53,');
    expect(label).toContain('આવક પાવતી 12');
    // Amounts and the date stay in Gujarati digits.
    expect(label).toContain('₹૨૦૦.૦૦');
    expect(texts()).toContain('૧૦ ઑક્ટો ૨૬');
  });

  it('the invoice card shows the financial year in Gujarati digits', async () => {
    await render(<MemoizedInvoiceItem invoice={invoice} onPress={jest.fn()} />);
    expect(texts()).toContain('નાણાકીય વર્ષ ૨૦૨૭-૨૦૨૮');
  });

  // The guard: whatever a card adds later, the line that names the document has no Gujarati digit.
  it.each([
    ['invoice', () => <MemoizedInvoiceItem invoice={invoice} onPress={jest.fn()} />, '53', 'ઇન્વૉઇસ 53'],
    ['dispatch', () => <MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} />, 'જાવક 207', 'જાવક 207'],
    ['recent dispatch', () => <RecentDispatchedOrderCard dispatch={recent} onPress={jest.fn()} />, 'જાવક 43', 'જાવક 43'],
  ])('the %s card names its document in 0-9', async (_name, element, title, spokenStart) => {
    await render(element());
    expect(texts()).toContain(title);
    const spoken = labels().find(text => text.startsWith(spokenStart));
    expect(spoken).toBeDefined();
    expect(GUJARATI_DIGIT.test(title)).toBe(false);
    expect(GUJARATI_DIGIT.test(spokenStart)).toBe(false);
  });

  it('the dispatch card keeps the vehicle number as stored and the counts in Gujarati digits', async () => {
    await render(<MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} />);
    const label = labels().find(text => text.startsWith('જાવક 207'));
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
    ['customer', tab => <CustomerTabNavigator activeTab={tab as never} onTabChange={jest.fn()} />, ['overview', 'pricing']],
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

  it.each(navigators)('the %s page gives every tab the same known icon in English and Gujarati', async (_name, element, tabs) => {
    for (const active of tabs) {
      setLanguage('en');
      await render(element(active));
      const english = iconNames();
      await screen.unmount();
      setLanguage('gu');
      await render(element(active));
      const gujarati = iconNames();
      await screen.unmount();
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

  it('English keeps the facts on one line', async () => {
    await render(card());
    expect(texts()).toContain('Average age 351 days · 2 over 1 year');
  });

  it('Gujarati gives each fact its own line, so no fact loses its last word', async () => {
    setLanguage('gu');
    await render(card());
    expect(texts()).toEqual(expect.arrayContaining(['Average age 351 days', '2 over 1 year']));
    expect(texts(true)).not.toContain('Average age 351 days · 2 over 1 year');
    // The spoken label still reads them as one sentence.
    expect(labels()[0]).toContain('Average age 351 days · 2 over 1 year');
  });

  it('four compact KPI tiles make two rows of two', async () => {
    // A 1080 px wide phone is about 392 dp wide.
    const before = Dimensions.get('window');
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
    const items = ['a', 'b', 'c', 'd'].map(label => ({ icon: 'warehouse' as const, value: 1, label }));
    await render(<KPIGrid items={items} compact />);
    // Each tile is one accessible card; the row it sits in is its parent, and holds as many tiles as the row is wide.
    const tilesInRow = ['a', 'b', 'c', 'd'].map(label => screen.getByLabelText(new RegExp(`^${label}\\b`)).parent!.children.length);
    await screen.unmount();
    Dimensions.set({ window: before });
    expect(tilesInRow).toEqual([2, 2, 2, 2]);
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
