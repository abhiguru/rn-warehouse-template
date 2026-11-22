/**
 * The rate box: the band table of one rate with its unit, tier tags, the strip of a refused save, the type choice and
 * Copy bands of a new rate, and the locked and read-only looks.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { RateBox, type RateBoxProps } from '@/features/item-pricing/components/RateBox';
import { setBandField } from '@/features/item-pricing/editModel';
import { useRateEditor, type UseRateEditor, type UseRateEditorArgs } from '@/features/item-pricing/useRateEditor';
import { replaceItemRates } from '@/services/item-pricing-service';
import { garlicRows, gingerRows, onionRows, textsOf } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
// Replacing typed bands asks first; the answer is set per test (true = "Replace").
const mockConfirmReplace = jest.fn();
jest.mock('@/features/item-pricing/components/CopyTiersSheet', () => {
  const R = require('react');
  const { Pressable, Text, View } = require('react-native');
  const { garlicRows: garlic, gingerRows: ginger } = require('@/tests/helpers/rateEditorFixtures');
  // A stand-in for the sheet: open, it says which item and type it was opened for and offers two items to pick.
  const pick = (label: string, onPress: () => void) => R.createElement(Pressable, { accessibilityRole: 'button', onPress }, R.createElement(Text, null, label));
  return {
    CopyTiersSheet: (props: { visible: boolean; itemId: string; priceType: string; onPick: (item: { id: string; name: string }, rows: unknown[]) => void }) =>
      props.visible
        ? R.createElement(View, null,
            R.createElement(Text, null, `Copy sheet for ${props.itemId}, ${props.priceType}`),
            pick('Pick Review Garlic Desi', () => props.onPick({ id: 'garlic', name: 'Review Garlic Desi' }, garlic())),
            pick('Pick Review Ginger Fresh', () => props.onPick({ id: 'ginger', name: 'Review Ginger Fresh' }, ginger())))
        : null,
    confirmReplaceBands: (name: string) => mockConfirmReplace(name),
  };
});

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
async function mount(over: Over = {}) {
  await render(<Harness rows={ROWS} {...over} />);
}
const WINDOW = Dimensions.get('window');
beforeEach(() => {
  mockOffline = false;
  mockConfirmReplace.mockResolvedValue(true);
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
});
afterEach(() => {
  Dimensions.set({ window: WINDOW });
  jest.clearAllMocks();
});
const copyButton = () => screen.getByRole('button', { name: 'Copy weight bands from another item…' });
const tagLabels = () =>
  screen.queryAllByTestId(/^band-tag-/).map(n => within(n).queryAllByText(/[\s\S]*/).map(x => [x.props.children].flat(Infinity).join('')).join(''));
const rentField = () => screen.getByTestId('band-0-rent');
const noteCopiedFrom = (name: string) => `Weight bands copied from ${name}. Change what is different.`;
const pickFromSheet = (name: string) => userEvent.press(screen.getByRole('button', { name: `Pick ${name}` }));

it('draws nothing until the rows are there', async () => {
  await render(<Harness rows={null} />);
  expect(screen.queryByTestId('box')).not.toBeOnTheScreen();
});

it('shows the unit of the rate above its table', async () => {
  await mount();
  expect(screen.getByText('per bag, per month')).toBeOnTheScreen();
  expect(screen.getByTestId('box-table')).toBeOnTheScreen();
});

it('leaves the unit line out when the screen already said it just above (showUnit false)', async () => {
  await render(<RateBoxWithoutUnit />);
  expect(screen.queryByText('per bag, per month')).not.toBeOnTheScreen();
  // The table is still there, and its rent fields still say "₹/month".
  expect(screen.getByTestId('box-table')).toBeOnTheScreen();
  expect(textsOf().some(text => text.startsWith('Rent ₹/month'))).toBe(true);
});

it('shows the line since when the rate is in force under the unit, when it is given', async () => {
  await render(<Harness rows={ROWS} caption="Lots received since 1 Apr 2026" />);
  expect(screen.getByText('per bag, per month')).toBeOnTheScreen();
  expect(screen.getByText('Lots received since 1 Apr 2026')).toBeOnTheScreen();
});

it('shows the tags while nothing is changed and hides them once a figure is typed over', async () => {
  await mount({ tags: ['standard', 'item'] });
  expect(tagLabels()).toEqual(['Standard', 'This item']);
  await act(() => editor.setDraft(setBandField(editor.draft!, 0, 'rent', '7')));
  expect(tagLabels()).toEqual([]);
  await act(() => editor.setDraft(setBandField(editor.draft!, 0, 'rent', '6.00')));
  expect(tagLabels()).toEqual(['Standard', 'This item']);
});

it('a locked box shows its figures, the note, and cannot be typed in', async () => {
  await mount({ locked: true });
  expect(screen.getByText('Save or discard the other change first.')).toBeOnTheScreen();
  expect(rentField()).toHaveDisplayValue('6.00');
  expect(rentField()).toHaveProp('editable', false);
  expect(screen.queryByTestId('add-band')).not.toBeOnTheScreen();
});

it('an open box has no locked note and takes typing', async () => {
  await mount();
  expect(screen.queryByText('Save or discard the other change first.')).not.toBeOnTheScreen();
  expect(rentField()).toHaveProp('editable', true);
});

it('shows the strip of a refused save, and the same message under the bands only once', async () => {
  jest.mocked(replaceItemRates).mockResolvedValue({ success: false, errorCode: 'SERVER', message: 'The server is busy.' } as never);
  await mount();
  await act(() => editor.setStartsOn('today', '2026-10-14'));
  await act(async () => { await editor.submit(); });
  expect(screen.getByRole('alert', { name: 'The server is busy.' })).toBeOnTheScreen();

  jest.mocked(replaceItemRates).mockResolvedValue({ success: false, errorCode: 'BANDS_GAP', message: 'There is a gap between the bands.' } as never);
  await act(async () => { await editor.submit(); });
  expect(editor.errors.bands).toBe('There is a gap between the bands.');
  expect(screen.getAllByText('There is a gap between the bands.')).toHaveLength(1);
  expect(screen.queryByTestId('editor-error')).not.toBeOnTheScreen();
});

describe('a new rate', () => {
  it('offers Copy bands, and the choice of Monthly or One-time for an item with no rate', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined });
    expect(copyButton()).toBeOnTheScreen();
    expect(screen.getByLabelText('Type')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio').map(n => n.props.accessibilityLabel)).toEqual(['Monthly', 'One-time']);
  });

  it('Copy bands opens the sheet for this item and type; the item chosen replaces the bands and is named', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined, item: { id: 'new-item', name: 'Review Onion Red Small' } });
    expect(screen.queryByText(/^Copy sheet for/)).not.toBeOnTheScreen();
    await userEvent.press(copyButton());
    expect(screen.getByText('Copy sheet for new-item, monthly')).toBeOnTheScreen();
    await pickFromSheet('Review Garlic Desi');
    expect(screen.getByText(noteCopiedFrom('Review Garlic Desi'))).toBeOnTheScreen();
    expect(editor.draft!.bands.map(b => [b.upTo, b.rent])).toEqual([['40', '6.00'], ['100', '9.50']]);
    expect(editor.dirty).toBe(true);
    // The sheet is closed again.
    expect(screen.queryByText(/^Copy sheet for/)).not.toBeOnTheScreen();
  });

  it('a second copy asks before it replaces the first, and the note names the new item', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined, item: { id: 'new-item', name: 'Review Onion Red Small' } });
    await userEvent.press(copyButton());
    await pickFromSheet('Review Garlic Desi');
    // The first copy replaced untouched bands: no question.
    expect(mockConfirmReplace).not.toHaveBeenCalled();
    await userEvent.press(copyButton());
    await pickFromSheet('Review Ginger Fresh');
    expect(mockConfirmReplace).toHaveBeenCalledWith('Review Ginger Fresh');
    expect(editor.draft!.bands.map(b => b.upTo)).toEqual(['100']);
    expect(textsOf().filter(x => x.startsWith('Weight bands copied from'))).toEqual([noteCopiedFrom('Review Ginger Fresh')]);
  });

  it('answering Cancel to the question keeps the bands that were copied first', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined, item: { id: 'new-item', name: 'Review Onion Red Small' } });
    await userEvent.press(copyButton());
    await pickFromSheet('Review Garlic Desi');
    mockConfirmReplace.mockResolvedValue(false);
    await userEvent.press(copyButton());
    await pickFromSheet('Review Ginger Fresh');
    expect(editor.draft!.bands.map(b => b.upTo)).toEqual(['40', '100']);
    expect(screen.getByText(noteCopiedFrom('Review Garlic Desi'))).toBeOnTheScreen();
  });

  it('Copy bands is off while offline', async () => {
    mockOffline = true;
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined });
    expect(copyButton()).toBeDisabled();
  });

  it('Copy bands is hidden in a locked or read-only box', async () => {
    const empty: never[] = [];
    await mount({ mode: 'add', rows: empty, priceType: undefined, locked: true });
    expect(screen.queryByRole('button', { name: 'Copy weight bands from another item…' })).not.toBeOnTheScreen();
  });

  it('a change of a rate in force has no Copy bands and no type choice', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: 'Copy weight bands from another item…' })).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Type')).not.toBeOnTheScreen();
  });

  it('a customer rate seeded from the default shows the copied note and the From cells', async () => {
    await mount({
      mode: 'addCustomer',
      item: { id: 'onion', name: 'Review Onion Red' },
      customer: { id: 'cust-b', name: 'Review Orchard B' },
      priceType: undefined,
      rows: onionRows().filter(r => !r.customer_id),
    });
    expect(screen.getByText('Copied from the default rate. Change what is different.')).toBeOnTheScreen();
    expect(screen.getByTestId('first-from')).toBeOnTheScreen();
  });
});
