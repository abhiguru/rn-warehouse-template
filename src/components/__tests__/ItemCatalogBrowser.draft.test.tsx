/**
 * The Add items picker keeps its selections (phone review 2026-10-14, OI-01):
 *  - what was chosen is seeded once and survives new `currentOrderItems` arrays;
 *  - every way out asks first when something was chosen and not added;
 *  - Add waits for the answer, closes when every lot was saved, and otherwise
 *    stays open with the lots that were not saved and the reason on each;
 *  - Add sends only what changed.
 *
 * The bottom sheet library is a stand-in that behaves as the installed 5.2.14
 * was read to: a swipe down dismisses the modal by itself (unless
 * `enablePanDownToClose` is off) and then calls `onDismiss`; a backdrop with
 * `pressBehavior="none"` never calls `onPress`.
 */
import React from 'react';
import { BackHandler } from 'react-native';
import { act, render, screen, userEvent, within, type RenderResult } from '@testing-library/react-native';
import ItemCatalogBrowser from '../ItemCatalogBrowser';
import { OrderService } from '@/services/order-service';
import { SessionRecentItemsService } from '@/services/session-recent-items-service';
import { showAlert } from '@/utils/alert';
import { alertTexts, dismissLatestAlert, pressAlertButton } from '@/tests/helpers/alertMock';
import type { PickerChange, PickerLine, PickerResult } from '@/features/orders/pickerDraft';

const mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

type SheetProps = { onDismiss?: () => void; enablePanDownToClose?: boolean; enableDismissOnClose?: boolean };
const mockSheet: { props: SheetProps; present: jest.Mock; dismiss: jest.Mock } = {
  props: {}, present: jest.fn(), dismiss: jest.fn(),
};
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      mockSheet.props = props;
      React.useImperativeHandle(ref, () => ({ present: mockSheet.present, dismiss: mockSheet.dismiss }));
      const Backdrop = props.backdropComponent;
      return React.createElement('BottomSheet', null,
        Backdrop ? React.createElement(Backdrop, { animatedIndex: { value: 0 }, animatedPosition: { value: 0 } }) : null,
        props.children);
    }),
    // As the library: with pressBehavior "none" no tap is attached, so onPress is never called.
    BottomSheetBackdrop: (props: any) => React.createElement('Backdrop', { testID: 'catalog-backdrop', pressBehavior: props.pressBehavior, accessible: props.accessible }, props.children),
    BottomSheetFlatList: (props: any) => React.createElement('CatalogList', { testID: 'catalog-list', getItemLayout: props.getItemLayout },
      props.ListHeaderComponent, props.data.map((item: any) =>
        React.createElement('CatalogItem', { key: item.id, testID: `catalog-item-${item.id}` }, props.renderItem({ item })))),
  };
});
jest.mock('@/services/order-service', () => ({ OrderService: {
  getAvailableItems: jest.fn(),
  searchCustomerItemsForOrder: jest.fn(() => Promise.resolve({ success: true, data: [] })),
} }));
jest.mock('@/services/stock-service', () => ({ StockService: {
  getCustomerGRNItems: jest.fn(() => Promise.resolve({ success: true, data: { items: [] } })),
} }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: {
  loadRecentlyAddedItems: jest.fn(() => Promise.resolve([])),
  cleanupExpiredItems: jest.fn(() => Promise.resolve()),
  saveRecentlyAddedItems: jest.fn(() => Promise.resolve()),
} }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
jest.mock('../RecentItemsQuickAdd', () => 'RecentItemsQuickAdd');

const lot = (id: string, name: string) => ({
  id, name, packaging: 'Bag', package_mark: 'FX', current_stock: 40, original_quantity: 50,
  catalog_id: null, rack: '', weight: 50, gr_id: 'grn-fictional', grn_number: 'FXG001', grn_date: '2026-09-30',
});
const LOTS = [lot('lot-a', 'Fictional potatoes'), lot('lot-b', 'Fictional onions'), lot('lot-c', 'Fictional garlic')];
const saved = (id: string, quantity: number): PickerLine =>
  ({ grnItemId: id, quantity, item: LOTS.find(candidate => candidate.id === id) ?? lot(id, `Fictional ${id}`) });

type AddItems = (changes: PickerChange[], onProgress: (position: number, total: number) => void) => Promise<PickerResult[]>;
const allSaved: AddItems = async changes => changes.map(change => ({ grnItemId: change.grnItemId, ok: true }));

let view: RenderResult | undefined;
let user: ReturnType<typeof userEvent.setup>;
let backHandler: (() => boolean | null | undefined) | undefined;
// Saves that a test keeps waiting: released after the test so nothing is left hanging.
const heldSaves: Array<() => void> = [];
const onClose = jest.fn();
const onAddItems = jest.fn<ReturnType<AddItems>, Parameters<AddItems>>();

const element = (currentOrderItems: PickerLine[]) => (
  <ItemCatalogBrowser isVisible customerId="customer-fictional" currentOrderItems={currentOrderItems} onClose={onClose} onAddItems={onAddItems} />
);
async function open(currentOrderItems: PickerLine[] = []) {
  view = await render(element(currentOrderItems));
  // The lots are read before they are drawn.
  await screen.findByTestId(`catalog-item-${LOTS[0].id}`);
}
const rerenderWith = async (currentOrderItems: PickerLine[]) => { await view!.rerender(element(currentOrderItems)); };
// The Add button has no fixed name (it counts the changes, then reads the saving progress): found by its test id.
const addButton = () => screen.getByTestId('catalog-add');
const pressLabel = async (label: string) => { await user.press(screen.getByRole('button', { name: label })); };
const choose = (name: string) => pressLabel(`Add 1 bag of ${name} · Bag`);
const pressAdd = async () => { await user.press(addButton()); };
const listedLots = () =>
  screen.getAllByTestId(/^catalog-item-/).map(item => String(item.props.testID).replace('catalog-item-', ''));
const selectedText = (name: string) => screen.queryByLabelText(`1 bag of ${name} · Bag selected`) !== null;
const reasonOf = (id: string) => screen.getByTestId(`catalog-reason-${id}`);

// The four ways out. A swipe is the library closing the sheet by itself.
const WAYS: Record<string, () => Promise<void>> = {
  Cancel: () => user.press(screen.getByRole('button', { name: 'Cancel adding items' })),
  Back: () => act(() => { expect(backHandler!()).toBe(true); }),
  scrim: () => user.press(screen.getByTestId('catalog-scrim')),
  swipe: () => act(() => { if (mockSheet.props.enablePanDownToClose !== false) mockSheet.props.onDismiss?.(); }),
};
const leaveBy = (way: string) => WAYS[way]();
const answer = (button: string) => act(() => { pressAlertButton(jest.mocked(showAlert), button); });

beforeEach(() => {
  jest.useFakeTimers();
  user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  jest.clearAllMocks();
  onAddItems.mockReset().mockImplementation(allSaved);
  jest.mocked(OrderService.getAvailableItems).mockResolvedValue({ success: true, message: '', data: LOTS } as never);
  backHandler = undefined;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandler = handler as () => boolean | null | undefined;
    return { remove: jest.fn() };
  });
});
afterEach(async () => {
  // A save a test kept waiting is let go; the tree is unmounted by Testing Library after this.
  await act(async () => { heldSaves.splice(0).forEach(release => release()); });
  view = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('what was chosen is seeded once', () => {
  it('survives a new array of the same saved lines, and one with a line someone else added', async () => {
    await open([]);
    expect(addButton()).toHaveTextContent('Add', { exact: true });
    await choose('Fictional potatoes');
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });

    // A parent re-render: the same content in a new array.
    await rerenderWith([]);
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
    expect(selectedText('Fictional potatoes')).toBe(true);

    // Another user saved a line meanwhile.
    await rerenderWith([saved('lot-other', 4)]);
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
    expect(selectedText('Fictional potatoes')).toBe(true);

    // Add sends the one lot the user chose: not the other user's line, and no removal of it.
    await pressAdd();
    expect(onAddItems).toHaveBeenCalledTimes(1);
    expect(onAddItems.mock.calls[0][0]).toEqual([{ grnItemId: 'lot-a', quantity: 1, expected: 0, packaging: 'Bag' }]);
  });

  it('shows the "In order" badge from the saved lines as they are now', async () => {
    await open([]);
    expect(screen.queryByText('In order')).not.toBeOnTheScreen();
    await rerenderWith([saved('lot-b', 2)]);
    expect(within(screen.getByTestId('catalog-item-lot-b')).getByText('In order')).toBeOnTheScreen();
    expect(within(screen.getByTestId('catalog-item-lot-a')).queryByText('In order')).not.toBeOnTheScreen();
    // The badge is all the new line changes: it is not selected and not sent.
    expect(addButton()).toHaveTextContent('Add', { exact: true });
  });

  it('counts unsaved changes on the Add button, not saved lots', async () => {
    await open([saved('lot-a', 2), saved('lot-b', 5)]);
    expect(addButton()).toHaveTextContent('Add', { exact: true });
    await choose('Fictional garlic');
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
    // Taking a saved lot off the order is a change too.
    await pressLabel('Remove 1 bag of Fictional potatoes · Bag');
    await pressLabel('Remove 1 bag of Fictional potatoes · Bag');
    expect(addButton()).toHaveTextContent('Add (2)', { exact: true });
    await pressAdd();
    expect(onAddItems.mock.calls[0][0]).toEqual([
      { grnItemId: 'lot-c', quantity: 1, expected: 0, packaging: 'Bag' },
      { grnItemId: 'lot-a', quantity: 0, expected: 2, packaging: 'Bag' },
    ]);
  });

  it('does not remove every line of the order when all saved lots are deselected: it says nothing is selected', async () => {
    await open([saved('lot-a', 1)]);
    await pressLabel('Remove 1 bag of Fictional potatoes · Bag');
    // The change is counted, so the button reads Add (1) ...
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
    await pressAdd();
    // ... but nothing is sent: removing a line is asked for on its card.
    expect(onAddItems).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(alertTexts(jest.mocked(showAlert))).toEqual([['No items selected', 'Choose a quantity for at least one item, then tap Add.']]);
  });

  it('stores a new lot\'s name as before and nothing of the selection', async () => {
    await open([]);
    await choose('Fictional potatoes');
    const stored = jest.mocked(SessionRecentItemsService.saveRecentlyAddedItems).mock.calls;
    expect(stored).toHaveLength(1);
    expect(stored[0][0]).toBe('customer-fictional');
    expect(stored[0][1].map(item => item.name)).toEqual(['Fictional potatoes']);
  });
});

it('names a box lot in boxes in the unsaved-changes question', async () => {
  const potatoes = LOTS[0];
  potatoes.packaging = 'Box';
  try {
    await open([]);
    await pressLabel('Add 10 boxes of Fictional potatoes · Box');
    await leaveBy('Cancel');
    expect(alertTexts(jest.mocked(showAlert))[0][1]).toContain('Fictional potatoes · Box · mark FX · GRN FXG001 · 50 kg each — add 10 boxes');
  } finally {
    potatoes.packaging = 'Bag';
  }
});

describe.each(Object.keys(WAYS))('leaving by %s', way => {
  it('closes at once when nothing was chosen', async () => {
    await open([saved('lot-b', 2)]);
    await leaveBy(way);
    expect(showAlert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks first when something was chosen and not added; "Keep editing" keeps it', async () => {
    await open([saved('lot-b', 2)]);
    await choose('Fictional potatoes');
    await leaveBy(way);
    expect(alertTexts(jest.mocked(showAlert))).toEqual([
      ['Add these changes to the order?', 'Changes to 1 lot have not been saved.\n\n• Fictional potatoes · Bag · mark FX · GRN FXG001 · 50 kg each — add 1 bag'],
    ]);
    const buttons = jest.mocked(showAlert).mock.calls[0][2]!;
    expect(buttons.map(button => [button.text, button.style])).toEqual([
      ['Add to order', undefined],
      ['Keep editing', 'cancel'],
      ['Discard selections', 'destructive'],
    ]);
    expect(onClose).not.toHaveBeenCalled();

    const presented = mockSheet.present.mock.calls.length;
    await answer('Keep editing');
    expect(onClose).not.toHaveBeenCalled();
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
    expect(selectedText('Fictional potatoes')).toBe(true);
    // A swipe took the sheet off the screen: it is shown again. The other ways never moved it.
    expect(mockSheet.present.mock.calls.length - presented).toBe(way === 'swipe' ? 1 : 0);
    expect(mockSheet.dismiss).not.toHaveBeenCalled();

    // It asks again the next time, and the answer still counts.
    await leaveBy(way);
    expect(showAlert).toHaveBeenCalledTimes(2);
    await answer('Discard selections');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once on "Discard selections"', async () => {
    await open([]);
    await choose('Fictional potatoes');
    await choose('Fictional onions');
    await leaveBy(way);
    expect(alertTexts(jest.mocked(showAlert))).toEqual([
      [
        'Add these changes to the order?',
        'Changes to 2 lots have not been saved.\n\n' +
          '• Fictional potatoes · Bag · mark FX · GRN FXG001 · 50 kg each — add 1 bag\n' +
          '• Fictional onions · Bag · mark FX · GRN FXG001 · 50 kg each — add 1 bag',
      ],
    ]);
    await answer('Discard selections');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAddItems).not.toHaveBeenCalled();
    // The library reporting its own dismissal afterwards does not close a second time.
    await act(() => { mockSheet.props.onDismiss?.(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledTimes(1);
  });

  it('"Add to order" sends the listed changes once, and the picker closes when all are saved', async () => {
    await open([]);
    await choose('Fictional potatoes');
    await leaveBy(way);
    await answer('Add to order');
    expect(onAddItems).toHaveBeenCalledTimes(1);
    expect(onAddItems.mock.calls[0][0]).toEqual([{ grnItemId: 'lot-a', quantity: 1, expected: 0, packaging: 'Bag' }]);
    expect(showAlert).toHaveBeenCalledTimes(1);
  });

  it('"Add to order" saves first: the sheet is not presented again and no saving header is left when all are saved', async () => {
    await open([]);
    await choose('Fictional potatoes');
    await leaveBy(way);
    const presented = mockSheet.present.mock.calls.length;
    await answer('Add to order');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSheet.present.mock.calls.length - presented).toBe(0);
    expect(addButton()).not.toHaveTextContent(/Saving/);
  });

  it('"Add to order" with a lot refused shows the sheet again with the reason', async () => {
    onAddItems.mockResolvedValueOnce([{ grnItemId: 'lot-a', ok: false, reason: 'Only 3 bags in stock.' }]);
    await open([]);
    await choose('Fictional potatoes');
    await leaveBy(way);
    const presented = mockSheet.present.mock.calls.length;
    await answer('Add to order');
    expect(onClose).not.toHaveBeenCalled();
    if (way === 'swipe') expect(mockSheet.present.mock.calls.length - presented).toBe(1);
    expect(reasonOf('lot-a')).toHaveTextContent('Only 3 bags in stock.', { exact: true });
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
  });

  it('keeps the selection when the question is closed without an answer', async () => {
    await open([]);
    await choose('Fictional potatoes');
    await leaveBy(way);
    await act(() => { dismissLatestAlert(jest.mocked(showAlert)); });
    expect(onClose).not.toHaveBeenCalled();
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
  });

  it('does nothing while an Add is being saved', async () => {
    onAddItems.mockImplementation(() => new Promise(resolve => { heldSaves.push(() => resolve([])); }));
    await open([]);
    await choose('Fictional potatoes');
    await pressAdd();
    await leaveBy(way);
    expect(showAlert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(addButton()).toHaveTextContent('Saving 1 of 1…', { exact: true });
  });
});

// The sheet is flung down and, before its closing animation ends, another way out is
// pressed: that one asks, and the library reports the dismissal while the question is open.
it.each(['Back', 'Cancel', 'scrim'])('shows the sheet again on "Keep editing" when a swipe took it away while the %s question was open', async way => {
  await open([saved('lot-b', 2)]);
  await choose('Fictional potatoes');
  await leaveBy(way);
  expect(showAlert).toHaveBeenCalledTimes(1);
  const presented = mockSheet.present.mock.calls.length;
  await act(() => { mockSheet.props.onDismiss?.(); });
  // The question on screen answers for the swipe too: it is not asked a second time.
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(mockSheet.present.mock.calls.length - presented).toBe(0);

  await answer('Keep editing');
  expect(mockSheet.present.mock.calls.length - presented).toBe(1);
  expect(mockSheet.dismiss).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
  expect(selectedText('Fictional potatoes')).toBe(true);

  // The sheet is up again, so the same answer the next time does not present it once more.
  await leaveBy(way);
  expect(showAlert).toHaveBeenCalledTimes(2);
  await answer('Keep editing');
  expect(mockSheet.present.mock.calls.length - presented).toBe(1);
  expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
});

it('takes the tap outside itself: the library\'s backdrop is told not to close the sheet', async () => {
  await open([]);
  // No query reads what the backdrop was told: these are the props the stand-in was given.
  const backdrop = screen.getByTestId('catalog-backdrop');
  expect(backdrop).toHaveProp('pressBehavior', 'none');
  // WH-238 (Design's ruling): the scrim is no screen-reader stop; the header's Cancel button is the one way out.
  expect(backdrop).toHaveProp('accessible', false);
  const scrim = screen.getByTestId('catalog-scrim');
  expect(scrim).toHaveProp('accessible', false);
  expect(scrim).toHaveProp('importantForAccessibility', 'no');
  expect(scrim.props.accessibilityLabel).toBeUndefined();
  expect(scrim.props.accessibilityRole).toBeUndefined();
  expect(screen.getByRole('button', { name: 'Cancel adding items' })).toBeOnTheScreen();
});

describe('Add waits for the server', () => {
  it('stays open with a saving state until every lot is answered, then closes', async () => {
    let settle!: (results: PickerResult[]) => void;
    let progress!: (position: number, total: number) => void;
    onAddItems.mockImplementation((_changes, onProgress) => {
      progress = onProgress;
      return new Promise(resolve => { settle = resolve; heldSaves.push(() => resolve([])); });
    });
    await open([]);
    await choose('Fictional potatoes');
    await choose('Fictional onions');
    await pressAdd();

    expect(onAddItems).toHaveBeenCalledTimes(1);
    expect(onAddItems.mock.calls[0][0]).toEqual([{ grnItemId: 'lot-a', quantity: 1, expected: 0, packaging: 'Bag' }, { grnItemId: 'lot-b', quantity: 1, expected: 0, packaging: 'Bag' }]);
    expect(onClose).not.toHaveBeenCalled();
    expect(addButton()).toHaveTextContent('Saving 1 of 2…', { exact: true });
    // The Add button is a busy, polite live region with nothing to press: a second tap cannot send again.
    const button = screen.getByRole('button', { name: 'Saving 1 of 2…' });
    expect(button).toBe(addButton());
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(button).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(button.props.onPress).toBeUndefined();
    await user.press(button);
    expect(onAddItems).toHaveBeenCalledTimes(1);
    // Cancel, the steppers and the presets are off; no swipe down.
    expect(screen.getByRole('button', { name: 'Cancel adding items' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel adding items' }).props.accessibilityState.disabled).toBe(true);
    const quantityButtons = screen.getAllByRole('button', { name: /^(Add|Remove) \d+ bags? of / });
    expect(quantityButtons.length).toBeGreaterThan(8);
    quantityButtons.forEach(candidate => {
      expect(candidate).toBeDisabled();
      expect(candidate.props.accessibilityState.disabled).toBe(true);
    });
    expect(mockSheet.props.enablePanDownToClose).toBe(false);
    // A stepper pressed anyway changes nothing.
    await pressLabel('Add 1 bag of Fictional garlic · Bag');
    expect(selectedText('Fictional garlic')).toBe(false);

    await act(() => { progress(2, 2); });
    expect(addButton()).toHaveTextContent('Saving 2 of 2…', { exact: true });
    expect(onClose).not.toHaveBeenCalled();

    await act(() => { settle([{ grnItemId: 'lot-a', ok: true }, { grnItemId: 'lot-b', ok: true }]); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('stays open with only the lot that was not saved, its reason on its row, and sends only that lot again', async () => {
    onAddItems.mockResolvedValueOnce([
      { grnItemId: 'lot-a', ok: true },
      { grnItemId: 'lot-b', ok: false, reason: 'Only 3 bags in stock.' },
    ]);
    await open([]);
    await choose('Fictional potatoes');
    await choose('Fictional onions');
    // A search is on when Add is tapped.
    const search = screen.getByLabelText('Search stock items');
    await user.paste(search, 'Fictional');
    expect(search).toHaveDisplayValue('Fictional');
    expect(screen.getByTestId('catalog-list').props.getItemLayout).toEqual(expect.any(Function));
    await pressAdd();

    expect(onClose).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
    const cancel = screen.getByRole('button', { name: 'Cancel adding items' });
    expect(cancel).toBeEnabled();
    expect(cancel.props.accessibilityState.disabled).toBe(false);
    expect(mockSheet.props.enablePanDownToClose).toBe(true);
    // The reason is on the failed lot's row and on no other.
    expect(reasonOf('lot-b')).toHaveTextContent('Only 3 bags in stock.', { exact: true });
    expect(screen.getAllByTestId(/^catalog-reason-/).map(reason => reason.props.testID)).toEqual(['catalog-reason-lot-b']);
    expect(screen.getByTestId('catalog-not-saved-summary')).toHaveTextContent('1 lot was not saved. See the reason on it.', { exact: true });
    // The search is cleared, the failed lot is first, and the taller row is measured, not estimated.
    expect(screen.getByLabelText('Search stock items')).toHaveDisplayValue('');
    expect(listedLots()[0]).toBe('lot-b');
    expect(screen.getByTestId('catalog-list').props.getItemLayout).toBeUndefined();
    // Both lots keep their quantities on screen; only the failed one is still to send.
    expect(selectedText('Fictional potatoes')).toBe(true);
    expect(selectedText('Fictional onions')).toBe(true);

    await pressAdd();
    expect(onAddItems).toHaveBeenCalledTimes(2);
    expect(onAddItems.mock.calls[1][0]).toEqual([{ grnItemId: 'lot-b', quantity: 1, expected: 0, packaging: 'Bag' }]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a lot saved with another quantity moves its base there: the next Add sends the chosen number against it and closes', async () => {
    onAddItems.mockResolvedValueOnce([
      { grnItemId: 'lot-b', ok: false, reason: 'Changed by someone else: now 29 bags.', savedQuantity: 29 },
    ]);
    await open([saved('lot-b', 30)]);
    await choose('Fictional onions');
    await pressAdd();
    expect(onAddItems.mock.calls[0][0]).toEqual([{ grnItemId: 'lot-b', quantity: 31, expected: 30, packaging: 'Bag' }]);
    expect(onClose).not.toHaveBeenCalled();
    expect(reasonOf('lot-b')).toHaveTextContent('Changed by someone else: now 29 bags.', { exact: true });

    await pressAdd();
    expect(onAddItems).toHaveBeenCalledTimes(2);
    expect(onAddItems.mock.calls[1][0]).toEqual([{ grnItemId: 'lot-b', quantity: 31, expected: 29, packaging: 'Bag' }]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names each lot that was not saved and drops a reason when that lot is changed', async () => {
    onAddItems.mockResolvedValueOnce([
      { grnItemId: 'lot-a', ok: false, reason: 'This lot is already in the order.' },
      { grnItemId: 'lot-b', ok: false, reason: 'Only 3 bags in stock.' },
    ]);
    await open([]);
    await choose('Fictional potatoes');
    await choose('Fictional onions');
    await pressAdd();
    expect(addButton()).toHaveTextContent('Add (2)', { exact: true });
    expect(screen.getByTestId('catalog-not-saved-summary')).toHaveTextContent('2 lots were not saved. See the reason on each.', { exact: true });
    expect(listedLots().slice(0, 2)).toEqual(['lot-a', 'lot-b']);

    await pressLabel('Remove 1 bag of Fictional potatoes · Bag');
    expect(screen.queryByTestId('catalog-reason-lot-a')).not.toBeOnTheScreen();
    expect(reasonOf('lot-b')).toHaveTextContent('Only 3 bags in stock.', { exact: true });
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
  });

  it('treats a lot without an answer, or a save that threw, as not saved', async () => {
    onAddItems.mockResolvedValueOnce([{ grnItemId: 'lot-a', ok: true }]);
    await open([]);
    await choose('Fictional potatoes');
    await choose('Fictional onions');
    await pressAdd();
    expect(onClose).not.toHaveBeenCalled();
    expect(reasonOf('lot-b')).toHaveTextContent('Not saved. Check your connection and try again.', { exact: true });

    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    onAddItems.mockRejectedValueOnce(new Error('fictional failure'));
    await pressAdd();
    expect(logged).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(addButton()).toHaveTextContent('Add (1)', { exact: true });
    expect(reasonOf('lot-b')).toHaveTextContent('Not saved. Check your connection and try again.', { exact: true });
  });

  it('shows the sheet again for the lots not saved when it was swiped away just as Add was tapped', async () => {
    let settle!: (results: PickerResult[]) => void;
    onAddItems.mockImplementation(() => new Promise(resolve => { settle = resolve; heldSaves.push(() => resolve([])); }));
    await open([]);
    await choose('Fictional potatoes');
    await pressAdd();
    // A swipe already under way when saving began: the library dismisses the sheet.
    const presented = mockSheet.present.mock.calls.length;
    await act(() => { mockSheet.props.onDismiss?.(); });
    expect(showAlert).not.toHaveBeenCalled();
    await act(() => { settle([{ grnItemId: 'lot-a', ok: false, reason: 'Only 3 bags in stock.' }]); });
    expect(mockSheet.present.mock.calls.length - presented).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(reasonOf('lot-a')).toHaveTextContent('Only 3 bags in stock.', { exact: true });
  });

  it('sends nothing when only saved lots are selected and none changed, and asks for a choice when nothing is', async () => {
    await open([saved('lot-a', 2)]);
    await pressAdd();
    expect(onAddItems).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    await view!.unmount();
    onClose.mockClear();
    await open([]);
    await pressAdd();
    expect(onAddItems).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(alertTexts(jest.mocked(showAlert))).toEqual([['No items selected', 'Choose a quantity for at least one item, then tap Add.']]);
  });
});
