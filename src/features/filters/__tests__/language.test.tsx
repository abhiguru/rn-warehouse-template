/**
 * The filter texts follow the app's language at run time. The configurations
 * are built when their files load, so every label must be read when it is
 * drawn (docs/I18N.md rule 2): these tests load everything in English, switch
 * to Gujarati and back, and check that each kind of label changed with it.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { ApplyFiltersButton } from '../components/ApplyFiltersButton';
import { pickerText } from '../components/editors/OptionPicker';
import { FilterBar } from '../components/FilterBar';
import { searchWords } from '../components/HighlightedText';
import { filteredEmptyProps } from '../components/FilteredListHeader';
import { DISPATCH_FILTERS, FILTER_CONFIGS, GRN_FILTERS, INVOICE_FILTERS, ITEM_PRICING_FILTERS, ORDER_FILTERS } from '../configs';
import { DATE_PRESETS } from '../datePresets';
import { currentSort, describeDateRange, describeSort, describeValue, financialYearLabel, readSearch, SORT_DIRECTIONS, visibleFields } from '../filterModel';
import type { FilterContext, FilterFieldDef, FilterListDefinition, FilterValues, PickerField } from '../types';
import { resultsLabel } from '../useFilterResultCount';
import type { useListFilters } from '../useListFilters';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

afterEach(() => setLanguage('en'));

const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
const field = (config: FilterListDefinition, key: string) => config.fields.find(candidate => candidate.key === key) as FilterFieldDef;
const thisYear = new Date().getFullYear();

describe('a language switch at run time', () => {
  it('changes a field label, and changes it back', () => {
    expect(field(GRN_FILTERS, 'date').label).toBe('Date');
    expect(field(GRN_FILTERS, 'numberRange').label).toBe('GRN number');
    setLanguage('gu');
    expect(field(GRN_FILTERS, 'date').label).toBe('તારીખ');
    expect(field(GRN_FILTERS, 'customers').label).toBe('વેપારી');
    expect(field(GRN_FILTERS, 'numberRange').label).toBe('આવક પાવતી નંબર');
    expect(field(GRN_FILTERS, 'package').label).toBe('માર્કો');
    expect(field(DISPATCH_FILTERS, 'bags').label).toBe('એક લાઇનના નંગ');
    expect(field(INVOICE_FILTERS, 'year').label).toBe('નાણાકીય વર્ષ');
    expect(field(ITEM_PRICING_FILTERS, 'expired').label).toBe('સમાપ્ત થયેલા દર પણ');
    expect(field(ORDER_FILTERS, 'withItems').label).toBe('આઇટમ સાથે');
    setLanguage('en');
    expect(field(GRN_FILTERS, 'date').label).toBe('Date');
  });

  it('changes choice options, units, placeholders, titles and search placeholders', () => {
    const stock = field(GRN_FILTERS, 'stock');
    const weight = field(GRN_FILTERS, 'weight');
    const numbers = field(GRN_FILTERS, 'numberRange');
    const year = field(INVOICE_FILTERS, 'year');
    const labels = (candidate: FilterFieldDef) => (candidate.kind === 'choice' ? candidate.options.map(option => option.label) : []);
    expect(labels(stock)).toEqual(['All', 'In stock', 'Out of stock']);
    expect(labels(year)[0]).toBe('All years');
    setLanguage('gu');
    expect(labels(stock)).toEqual(['બધા', 'સ્ટોકમાં છે', 'સ્ટોક નથી']);
    expect(labels(year)[0]).toBe('બધાં વર્ષ');
    expect(labels(year)[1]).toBe(financialYearLabel(Number(year.kind === 'choice' ? year.options[1].value : 0)));
    expect(labels(year)[1]).toMatch(/^[૦-૯]{4}-[૦-૯]{2}$/);
    expect(weight.kind === 'numberRange' && weight.unit).toBe('કિલો');
    expect(numbers.kind === 'textRange' && numbers.placeholder).toEqual(['શરૂઆતનો નંબર', 'છેલ્લો નંબર']);
    expect(GRN_FILTERS.title).toBe('આવક પાવતી ફિલ્ટર કરો');
    expect(GRN_FILTERS.search?.placeholder).toBe('આવક પાવતી શોધો');
    expect(ORDER_FILTERS.search?.placeholder).toBe('ઑર્ડર શોધો');
  });

  it('changes the copies in FILTER_CONFIGS too: they are not frozen in the language they were built in', () => {
    const config = FILTER_CONFIGS['grn-list'];
    expect(config.title).toBe('Filter GRNs');
    setLanguage('gu');
    expect(config.title).toBe('આવક પાવતી ફિલ્ટર કરો');
    expect(config.search?.placeholder).toBe('આવક પાવતી શોધો');
    expect(visibleFields(config, staff).map(candidate => candidate.label)).toEqual([
      'સ્ટોક', 'તારીખ', 'વેપારી', 'આઇટમ', 'આવક પાવતી નંબર', 'વજન', 'માર્કો',
    ]);
    expect(typeof config.countResults).toBe('function');
  });

  it('changes a date preset label', () => {
    expect(DATE_PRESETS.map(preset => preset.label)).toEqual(['Today', 'Yesterday', 'Last 7 days', 'This month', 'Last month']);
    setLanguage('gu');
    expect(DATE_PRESETS.map(preset => preset.label)).toEqual(['આજે', 'ગઈકાલે', 'છેલ્લા ૭ દિવસ', 'આ મહિને', 'ગયા મહિને']);
    expect(describeValue(field(GRN_FILTERS, 'date'), { preset: 'lastMonth' })).toBe('ગયા મહિને');
  });

  it('changes a sort label and the sort directions', () => {
    const sortLabels = () => GRN_FILTERS.sort!.options.map(option => option.label);
    expect(sortLabels()).toEqual(['GRN number', 'Date']);
    expect(SORT_DIRECTIONS.date.desc).toBe('Newest first');
    setLanguage('gu');
    expect(sortLabels()).toEqual(['આવક પાવતી નંબર', 'તારીખ']);
    expect(SORT_DIRECTIONS.date).toEqual({ desc: 'સૌથી નવા પહેલાં', asc: 'સૌથી જૂના પહેલાં' });
    expect(SORT_DIRECTIONS.number).toEqual({ desc: 'નંબર: ઉતરતા ક્રમમાં', asc: 'નંબર: ચઢતા ક્રમમાં' });
    expect(describeSort(GRN_FILTERS, undefined)).toEqual({ label: 'આવક નં.', direction: 'નંબર: ઉતરતા ક્રમમાં', spoken: 'નંબર: ઉતરતા ક્રમમાં' });
    expect(describeSort(INVOICE_FILTERS, { field: 'customer_name', order: 'asc' })).toEqual({ label: 'વેપારી', direction: 'A થી Z', spoken: 'A થી Z' });
    expect(describeSort(ORDER_FILTERS, undefined).label).toBe('સૉર્ટ કરો');
  });

  it('changes the "Show N items" button, per noun, with the count in Gujarati digits', () => {
    const count = (n: number | null) => ({ count: n, loading: false });
    expect(resultsLabel(count(24), ['item', 'items'])).toBe('Show 24 items');
    expect(resultsLabel(count(1), ['dispatch', 'dispatches'])).toBe('Show 1 dispatch');
    expect(resultsLabel(count(0), ['price', 'prices'])).toBe('No prices match');
    setLanguage('gu');
    expect(resultsLabel(count(24), ['item', 'items'])).toBe('૨૪ આઇટમ બતાવો');
    expect(resultsLabel(count(1), ['item', 'items'])).toBe('૧ આઇટમ બતાવો');
    expect(resultsLabel(count(123456), ['item', 'items'])).toBe('૧,૨૩,૪૫૬ આઇટમ બતાવો');
    expect(resultsLabel(count(0), ['item', 'items'])).toBe('કોઈ આઇટમ મળતી નથી');
    expect(resultsLabel(count(3), ['dispatch', 'dispatches'])).toBe('૩ જાવક બતાવો');
    expect(resultsLabel(count(0), ['invoice', 'invoices'])).toBe('કોઈ ઇન્વૉઇસ મળતું નથી');
    expect(resultsLabel(count(7), ['order', 'orders'])).toBe('૭ ઑર્ડર બતાવો');
    expect(resultsLabel(count(2), ['price', 'prices'])).toBe('૨ દર બતાવો');
    expect(resultsLabel(count(null), ['item', 'items'])).toBe('પરિણામો બતાવો');
    // Every list's noun has its own sentences.
    for (const config of Object.values(FILTER_CONFIGS)) {
      expect(resultsLabel(count(5), config.noun)).toMatch(/^૫ .+ બતાવો$/);
    }
  });

  it('draws the button text in Gujarati', () => {
    setLanguage('gu');
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<ApplyFiltersButton result={{ count: 24, loading: false }} noun={['item', 'items']} onPress={jest.fn()} />);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('૨૪ આઇટમ બતાવો');
    act(() => renderer.unmount());
  });

  it('changes what a chip says: ranges read "…થી … સુધી" after their values', () => {
    const weight = field(GRN_FILTERS, 'weight');
    const numbers = field(GRN_FILTERS, 'numberRange');
    const invoiceNumbers = field(INVOICE_FILTERS, 'numberRange');
    const date = field(GRN_FILTERS, 'date');
    expect(describeValue(weight, { min: 10, max: 50 })).toBe('10 – 50 kg');
    expect(describeValue(date, { from: `${thisYear}-10-01`, to: `${thisYear}-10-07` })).toBe('1 Oct – 7 Oct');
    expect(describeValue(date, { from: `${thisYear}-10-01` })).toBe('From 1 Oct');
    expect(describeValue(date, { to: `${thisYear}-10-07` })).toBe('Until 7 Oct');
    expect(describeValue(numbers, { from: 'A0010' })).toBe('From A0010');
    expect(describeValue(numbers, { to: 'A0020' })).toBe('Up to A0020');
    expect(describeValue(invoiceNumbers, { min: 5 })).toBe('5 or more');
    setLanguage('gu');
    expect(describeValue(weight, { min: 10, max: 50 })).toBe('૧૦થી ૫૦ કિલો સુધી');
    expect(describeValue(weight, { min: 9000000 })).toBe('૯૦,૦૦,૦૦૦ કિલો કે વધુ');
    expect(describeValue(weight, { max: 5 })).toBe('૫ કિલો સુધી');
    expect(describeValue(invoiceNumbers, { min: 5, max: 9 })).toBe('૫થી ૯ સુધી');
    expect(describeValue(date, { from: `${thisYear}-10-01`, to: `${thisYear}-10-07` })).toBe('૧ ઑક્ટોથી ૭ ઑક્ટો સુધી');
    expect(describeValue(date, { from: `${thisYear}-10-01` })).toBe('૧ ઑક્ટોથી');
    expect(describeValue(date, { to: `${thisYear}-10-07` })).toBe('૭ ઑક્ટો સુધી');
    expect(describeDateRange({ from: `${thisYear}-10-07`, to: `${thisYear}-10-07` })).toBe('૭ ઑક્ટો');
    // Document numbers are identifiers: their digits stay as typed.
    expect(describeValue(numbers, { from: 'A0010', to: 'A0020' })).toBe('A0010થી A0020 સુધી');
    expect(describeValue(numbers, { from: 'A0010' })).toBe('A0010થી');
    expect(describeValue(numbers, { to: 'A0020' })).toBe('A0020 સુધી');
    expect(describeValue(field(GRN_FILTERS, 'stock'), 'out_of_stock')).toBe('સ્ટોક નથી');
    expect(describeValue(field(GRN_FILTERS, 'package'), ' red ')).toBe('માર્કો: red');
    expect(describeValue(field(GRN_FILTERS, 'customers'), [{ id: '1', label: 'Lakeview Spices' }, { id: '2', label: 'B' }, { id: '3', label: 'C' }])).toBe('Lakeview Spices +૨');
  });

  it('changes the picker and the empty-state sentences', () => {
    const customers = field(GRN_FILTERS, 'customers') as PickerField;
    const items = field(GRN_FILTERS, 'items') as PickerField;
    const filters = (search: string) => ({ search, hasAny: true, clear: jest.fn() }) as unknown as ReturnType<typeof useListFilters>;
    expect(pickerText(customers.noun, 'search')).toBe('Search customers');
    expect(pickerText(items.noun, 'noMatch', 'gar')).toBe('No items match "gar".');
    expect(filteredEmptyProps(filters('garlic'), 'dispatches').filteredTitle).toBe('No dispatches match "garlic"');
    setLanguage('gu');
    expect(pickerText(customers.noun, 'search')).toBe('વેપારી શોધો');
    expect(pickerText(items.noun, 'noMatch', 'gar')).toBe('"gar" સાથે કોઈ આઇટમ મળતી નથી.');
    expect(filteredEmptyProps(filters('garlic'), 'dispatches')).toMatchObject({
      filteredTitle: '"garlic" સાથે કોઈ જાવક મળતી નથી',
      filteredSubtitle: 'જોડણી તપાસો, ઓછા શબ્દો લખો, અથવા કોઈ ફિલ્ટર કાઢી નાખો.',
      clearFiltersLabel: 'શોધ અને ફિલ્ટર સાફ કરો',
    });
    expect(filteredEmptyProps(filters(''), 'orders')).toMatchObject({
      filteredTitle: 'તમારા ફિલ્ટર સાથે કોઈ ઑર્ડર મળતો નથી',
      clearFiltersLabel: 'ફિલ્ટર સાફ કરો',
    });
  });
});

describe('the filter bar in Gujarati', () => {
  function labels(values: FilterValues) {
    const config = FILTER_CONFIGS['grn-list'];
    const filters = {
      ctx: staff,
      fields: visibleFields(config, staff),
      values,
      sort: currentSort(config, undefined),
      request: {},
      search: typeof values.search === 'string' ? values.search : '',
      activeCount: 2,
      hasAny: true,
      apply: jest.fn(),
      setField: jest.fn(),
      setSearch: jest.fn(),
      searchAsText: jest.fn(),
      setSort: jest.fn(),
      clear: jest.fn(),
    } as unknown as ReturnType<typeof useListFilters>;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<FilterBar config={config} filters={filters} onOpenAll={jest.fn()} />);
    });
    const found = renderer.root
      .findAll(
        node =>
          typeof node.type !== 'string' &&
          node.props.accessibilityRole === 'button' &&
          typeof node.props.accessibilityLabel === 'string' &&
          node.parent?.props.accessibilityLabel !== node.props.accessibilityLabel
      )
      .map(node => node.props.accessibilityLabel as string);
    const text = JSON.stringify(renderer.toJSON());
    act(() => renderer.unmount());
    return { found, text };
  }

  it('says every chip and its spoken label in Gujarati', () => {
    setLanguage('gu');
    const bar = labels({ stock: 'in_stock', weight: { min: 10, max: 50 }, search: 'A0010થી A0012' });
    expect(bar.found).toEqual([
      'ફિલ્ટર, ૨ લાગુ છે. સૉર્ટ અને ફિલ્ટર ખોલો',
      'આવક નં. મુજબ સૉર્ટ કરેલું, નંબર: ઉતરતા ક્રમમાં. સૉર્ટ બદલો',
      'સ્ટોક: સ્ટોકમાં છે. બદલો',
      'સ્ટોક: સ્ટોકમાં છે ફિલ્ટર કાઢી નાખો',
      'વજન: ૧૦થી ૫૦ કિલો સુધી. બદલો',
      'વજન: ૧૦થી ૫૦ કિલો સુધી ફિલ્ટર કાઢી નાખો',
      'નંબર A0010થી A0012 સુધી, તમારી શોધમાંથી વાંચ્યા છે. તેના બદલે આ શબ્દોને લખાણ તરીકે શોધો',
      'તમારી શોધમાંથી વાંચેલા નંબર A0010થી A0012 સુધીનું ફિલ્ટર કાઢી નાખો',
      'તારીખ મુજબ ફિલ્ટર કરો',
      'વેપારી મુજબ ફિલ્ટર કરો',
      'બધા ફિલ્ટર અને શોધ સાફ કરો',
    ]);
    // The visible chip texts, and the badge count in Gujarati digits.
    for (const visible of ['ફિલ્ટર', '"૨"', 'આવક નં.', 'સ્ટોકમાં છે', '૧૦થી ૫૦ કિલો સુધી', 'A0010થી A0012 સુધી', 'બધું સાફ કરો']) {
      expect(bar.text).toContain(visible);
    }
  });

  it('is unchanged in English', () => {
    const bar = labels({ stock: 'in_stock', search: 'A0010 to A0012' });
    expect(bar.found).toEqual([
      'Filters, 2 applied. Open sort and filter',
      'Sorted by GRN no., highest number first. Change sort',
      'Stock: In stock. Change',
      'Remove filter Stock In stock',
      'Numbers A0010 to A0012, read from your search. Search for these words as text instead',
      'Remove filter number range A0010 to A0012 from your search',
      'Filter by date',
      'Filter by customer',
      'Clear all filters and the search',
    ]);
  });
});

describe('digits typed in Gujarati', () => {
  it('are searched for as 0-9, also when every word is taken as text', () => {
    expect(readSearch(GRN_FILTERS, { search: 'rack ૧૨' }).text).toBe('rack 12');
    expect(readSearch(GRN_FILTERS, { search: '૭/૧૦  rack', searchLiteral: true }).text).toBe('7/10 rack');
    expect(ORDER_FILTERS.toRequest({ search: ' lakeview  ૧૨ ' }, undefined, staff)).toEqual({ search: 'lakeview 12' });
    expect(searchWords('Rack ૧૨')).toEqual(['rack', '12']);
  });
});
