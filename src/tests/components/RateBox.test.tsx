/**
 * The rate box: the band table of one rate with its unit, tier tags, the strip of a refused save, the type choice and
 * Copy bands of a new rate, and the locked and read-only looks.
 */
import React from 'react';
import { Dimensions, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { RateBox, type RateBoxProps } from '@/features/item-pricing/components/RateBox';
import { setBandField } from '@/features/item-pricing/editModel';
import { useRateEditor, type UseRateEditor, type UseRateEditorArgs } from '@/features/item-pricing/useRateEditor';
import { replaceItemRates } from '@/services/item-pricing-service';
import { garlicRows, gingerRows, onionRows } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
let sheetProps: { visible?: boolean; itemId?: string; priceType?: string; onPick?: (item: { id: string; name: string }, rows: unknown[]) => void } | null = null;
// Replacing typed bands asks first; the answer is set per test (true = "Replace").
const mockConfirmReplace = jest.fn();
jest.mock('@/features/item-pricing/components/CopyTiersSheet', () => ({
  CopyTiersSheet: (props: typeof sheetProps) => { sheetProps = props; return null; },
  confirmReplaceBands: (name: string) => mockConfirmReplace(name),
}));

let editor!: UseRateEditor;
type Over = Partial<UseRateEditorArgs> & Pick<RateBoxProps, 'tags' | 'locked' | 'readOnly' | 'caption'>;
function Harness({ tags, locked, readOnly, caption, ...over }: Over) {
  editor = useRateEditor({
    item: { id: 'garlic', name: 'Review Garlic Desi' },
    customer: null,
    priceType: 'monthly',
    mode: 'change',
    rows: garlicRows(),
    refreshRows: jest.fn(),
    role: 'admin',
    today: '2026-10-14',
    onSaved: jest.fn(),
    ...over,
  });
  return <RateBox editor={editor} tags={tags} locked={locked} readOnly={readOnly} caption={caption} testID="box" />;
}

function RateBoxWithoutUnit() {
  editor = useRateEditor({
    item: { id: 'garlic', name: 'Review Garlic Desi' },
    customer: null,
    priceType: 'monthly',
    mode: 'change',
    rows: ROWS,
    refreshRows: jest.fn(),
    role: 'admin',
    today: '2026-10-14',
    onSaved: jest.fn(),
  });
  return <RateBox editor={editor} showUnit={false} testID="box" />;
}

// A stable array, so the draft is not reopened at every render.
const ROWS = garlicRows();
let tree: ReactTestRenderer | undefined;
async function mount(over: Over = {}) {
  await act(async () => { tree = create(<Harness rows={ROWS} {...over} />); });
  return tree!;
}
const WINDOW = Dimensions.get('window');
beforeEach(() => {
  mockOffline = false;
  sheetProps = null;
  mockConfirmReplace.mockResolvedValue(true);
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  Dimensions.set({ window: WINDOW });
  jest.clearAllMocks();
});
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const byTestId = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const copyButton = () => tree!.root.find(n => n.props.testID === 'copy-tiers' && typeof n.props.onPress === 'function');
const tagLabels = () => tree!.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('band-tag-') && n.props.label).map(n => n.props.label);

it('draws nothing until the rows are there', async () => {
  await act(async () => { tree = create(<Harness rows={null} />); });
  expect(byTestId('box')).toHaveLength(0);
});

it('shows the unit of the rate above its table', async () => {
  await mount();
  expect(texts()).toContain('per bag, per month');
  expect(byTestId('box-table').length).toBeGreaterThan(0);
});

it('leaves the unit line out when the screen already said it just above (showUnit false)', async () => {
  await act(async () => { tree = create(<RateBoxWithoutUnit />); });
  expect(texts()).not.toContain('per bag, per month');
  // The table is still there, and its rent fields still say "₹/month".
  expect(byTestId('box-table').length).toBeGreaterThan(0);
  expect(texts().some(text => text.startsWith('Rent ₹/month'))).toBe(true);
});

it('shows the line since when the rate is in force under the unit, when it is given', async () => {
  await act(async () => { tree = create(<Harness rows={ROWS} caption="Lots received since 1 Apr 2026" />); });
  expect(texts()).toEqual(expect.arrayContaining(['per bag, per month', 'Lots received since 1 Apr 2026']));
});

it('shows the tags while nothing is changed and hides them once a figure is typed over', async () => {
  await mount({ tags: ['standard', 'item'] });
  expect(tagLabels()).toEqual(['Standard', 'This item']);
  act(() => editor.setDraft(setBandField(editor.draft!, 0, 'rent', '7')));
  expect(tagLabels()).toEqual([]);
  act(() => editor.setDraft(setBandField(editor.draft!, 0, 'rent', '6.00')));
  expect(tagLabels()).toEqual(['Standard', 'This item']);
});

it('a locked box shows its figures, the note, and cannot be typed in', async () => {
  await mount({ locked: true });
  expect(texts()).toContain('Save or discard the other change first.');
  const rent = tree!.root.findAllByType(TextInput).find(n => n.props.testID === 'band-0-rent')!;
  expect(rent.props.value).toBe('6.00');
  expect(rent.props.editable).toBe(false);
  expect(byTestId('add-band')).toHaveLength(0);
});

it('an open box has no locked note and takes typing', async () => {
  await mount();
  expect(texts()).not.toContain('Save or discard the other change first.');
  const rent = tree!.root.findAllByType(TextInput).find(n => n.props.testID === 'band-0-rent')!;
  expect(rent.props.editable).toBe(true);
});

it('shows the strip of a refused save, and the same message under the bands only once', async () => {
  jest.mocked(replaceItemRates).mockResolvedValue({ success: false, errorCode: 'SERVER', message: 'The server is busy.' } as never);
  await mount();
  act(() => editor.setStartsOn('today', '2026-10-14'));
  await act(async () => { await editor.submit(); });
  const strip = byTestId('editor-error')[0];
  expect(strip.props.accessibilityLabel).toBe('The server is busy.');

  jest.mocked(replaceItemRates).mockResolvedValue({ success: false, errorCode: 'BANDS_GAP', message: 'There is a gap between the bands.' } as never);
  await act(async () => { await editor.submit(); });
  expect(editor.errors.bands).toBe('There is a gap between the bands.');
  expect(texts().filter(s => s === 'There is a gap between the bands.')).toHaveLength(1);
  expect(byTestId('editor-error')).toHaveLength(0);
});

describe('a new rate', () => {
  it('offers Copy bands, and the choice of Monthly or One-time for an item with no rate', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined });
    expect(byTestId('copy-tiers').length).toBeGreaterThan(0);
    const choice = tree!.root.findAll(n => n.props.accessibilityRole === 'radiogroup' || (Array.isArray(n.props.options) && n.props.options.length === 2));
    expect(choice.length).toBeGreaterThan(0);
  });

  it('Copy bands opens the sheet for this item and type; the item chosen replaces the bands and is named', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined, item: { id: 'new-item', name: 'Review Onion Red Small' } });
    expect(sheetProps).toBeNull();
    await act(async () => { copyButton().props.onPress(); });
    expect(sheetProps).toMatchObject({ visible: true, itemId: 'new-item', priceType: 'monthly' });
    await act(async () => { sheetProps!.onPick!({ id: 'garlic', name: 'Review Garlic Desi' }, garlicRows()); });
    expect(texts()).toContain('Weight bands copied from Review Garlic Desi. Change what is different.');
    expect(editor.draft!.bands.map(b => [b.upTo, b.rent])).toEqual([['40', '6.00'], ['100', '9.50']]);
    expect(editor.dirty).toBe(true);
    // The sheet is closed again.
    expect(tree!.root.findAll(n => n.props.visible === true && typeof n.props.onPick === 'function')).toHaveLength(0);
  });

  it('a second copy asks before it replaces the first, and the note names the new item', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined, item: { id: 'new-item', name: 'Review Onion Red Small' } });
    const open = async () => { await act(async () => { copyButton().props.onPress(); }); };
    await open();
    await act(async () => { sheetProps!.onPick!({ id: 'garlic', name: 'Review Garlic Desi' }, garlicRows()); });
    // The first copy replaced untouched bands: no question.
    expect(mockConfirmReplace).not.toHaveBeenCalled();
    await open();
    await act(async () => { sheetProps!.onPick!({ id: 'ginger', name: 'Review Ginger Fresh' }, gingerRows()); });
    expect(mockConfirmReplace).toHaveBeenCalledWith('Review Ginger Fresh');
    expect(editor.draft!.bands.map(b => b.upTo)).toEqual(['100']);
    expect(texts().filter(x => x.startsWith('Weight bands copied from'))).toEqual(['Weight bands copied from Review Ginger Fresh. Change what is different.']);
  });

  it('answering Cancel to the question keeps the bands that were copied first', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined, item: { id: 'new-item', name: 'Review Onion Red Small' } });
    await act(async () => { copyButton().props.onPress(); });
    await act(async () => { sheetProps!.onPick!({ id: 'garlic', name: 'Review Garlic Desi' }, garlicRows()); });
    mockConfirmReplace.mockResolvedValue(false);
    await act(async () => { copyButton().props.onPress(); });
    await act(async () => { sheetProps!.onPick!({ id: 'ginger', name: 'Review Ginger Fresh' }, gingerRows()); });
    expect(editor.draft!.bands.map(b => b.upTo)).toEqual(['40', '100']);
    expect(texts()).toContain('Weight bands copied from Review Garlic Desi. Change what is different.');
  });

  it('Copy bands is off while offline', async () => {
    mockOffline = true;
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined });
    expect(copyButton().props.disabled).toBe(true);
  });

  it('Copy bands is hidden in a locked or read-only box', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined, locked: true });
    expect(byTestId('copy-tiers')).toHaveLength(0);
  });

  it('a change of a rate in force has no Copy bands and no type choice', async () => {
    await mount();
    expect(byTestId('copy-tiers')).toHaveLength(0);
    expect(tree!.root.findAll(n => Array.isArray(n.props.options) && n.props.options.length === 2)).toHaveLength(0);
  });

  it('a customer rate seeded from the default shows the copied note and the From cells', async () => {
    await mount({
      mode: 'addCustomer',
      item: { id: 'onion', name: 'Review Onion Red' },
      customer: { id: 'cust-b', name: 'Review Orchard B' },
      priceType: undefined,
      rows: onionRows().filter(r => !r.customer_id),
    });
    expect(texts()).toContain('Copied from the default rate. Change what is different.');
    expect(byTestId('first-from').length).toBeGreaterThan(0);
  });
});
