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
import { BackHandler, TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-community/slider', () => 'Slider');

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
    BottomSheetBackdrop: (props: any) => React.createElement('Backdrop', { pressBehavior: props.pressBehavior, accessible: props.accessible }, props.children),
    BottomSheetFlatList: (props: any) => React.createElement('CatalogList', { getItemLayout: props.getItemLayout },
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

let tree: ReactTestRenderer | undefined;
let backHandler: (() => boolean | null | undefined) | undefined;
const onClose = jest.fn();
const onAddItems = jest.fn<ReturnType<AddItems>, Parameters<AddItems>>();

const element = (currentOrderItems: PickerLine[]) => (
  <ItemCatalogBrowser isVisible customerId="customer-fictional" currentOrderItems={currentOrderItems} onClose={onClose} onAddItems={onAddItems} />
);
async function open(currentOrderItems: PickerLine[] = []) {
  await act(async () => { tree = create(element(currentOrderItems)); });
  return tree!;
}
const node = (testID: string): ReactTestInstance => tree!.root.findAll(candidate => candidate.props.testID === testID)[0];
const textOf = (instance: ReactTestInstance): string =>
  instance.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const addButtonText = () => textOf(node('catalog-add'));
const pressLabel = (label: string) => act(async () => {
  tree!.root.findAll(candidate => candidate.props.accessibilityLabel === label && typeof candidate.props.onPress === 'function')[0].props.onPress();
});
const choose = (name: string) => pressLabel(`Add 1 bag of ${name}`);
const pressAdd = () => act(async () => { node('catalog-add').props.onPress(); });
const listedLots = () =>
  tree!.root.findAllByType('CatalogItem' as never).map(item => String(item.props.testID).replace('catalog-item-', ''));
const selectedText = (name: string) =>
  tree!.root.findAll(candidate => candidate.props.accessibilityLabel === `1 bag of ${name} selected`).length > 0;

// The four ways out. A swipe is the library closing the sheet by itself.
const WAYS: Record<string, () => void> = {
  Cancel: () => node('catalog-cancel').props.onPress(),
  Back: () => { expect(backHandler!()).toBe(true); },
  scrim: () => node('catalog-scrim').props.onPress(),
  swipe: () => { if (mockSheet.props.enablePanDownToClose !== false) mockSheet.props.onDismiss?.(); },
};
const leaveBy = (way: string) => act(async () => { WAYS[way](); });
const answer = (button: string) => act(async () => { pressAlertButton(jest.mocked(showAlert), button); });

beforeEach(() => {
  jest.useFakeTimers();
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
  // A tree left mounted logs after the test is over.
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('what was chosen is seeded once', () => {
  it('survives a new array of the same saved lines, and one with a line someone else added', async () => {
    await open([]);
    expect(addButtonText()).toBe('Add');
    await choose('Fictional potatoes');
    expect(addButtonText()).toBe('Add (1)');

    // A parent re-render: the same content in a new array.
    await act(async () => { tree!.update(element([])); });
    expect(addButtonText()).toBe('Add (1)');
    expect(selectedText('Fictional potatoes')).toBe(true);

    // Another user saved a line meanwhile.
    await act(async () => { tree!.update(element([saved('lot-other', 4)])); });
    expect(addButtonText()).toBe('Add (1)');
    expect(selectedText('Fictional potatoes')).toBe(true);

    // Add sends the one lot the user chose: not the other user's line, and no removal of it.
    await pressAdd();
    expect(onAddItems).toHaveBeenCalledTimes(1);
    expect(onAddItems.mock.calls[0][0]).toEqual([{ grnItemId: 'lot-a', quantity: 1, expected: 0 }]);
  });

  it('shows the "In order" badge from the saved lines as they are now', async () => {
    await open([]);
    expect(JSON.stringify(tree!.toJSON())).not.toContain('In order');
    await act(async () => { tree!.update(element([saved('lot-b', 2)])); });
    expect(textOf(node('catalog-item-lot-b'))).toContain('In order');
    expect(textOf(node('catalog-item-lot-a'))).not.toContain('In order');
    // The badge is all the new line changes: it is not selected and not sent.
    expect(addButtonText()).toBe('Add');
  });

  it('counts unsaved changes on the Add button, not saved lots', async () => {
    await open([saved('lot-a', 2), saved('lot-b', 5)]);
    expect(addButtonText()).toBe('Add');
    await choose('Fictional garlic');
    expect(addButtonText()).toBe('Add (1)');
    // Taking a saved lot off the order is a change too.
    await pressLabel('Remove 1 bag of Fictional potatoes');
    await pressLabel('Remove 1 bag of Fictional potatoes');
    expect(addButtonText()).toBe('Add (2)');
    await pressAdd();
    expect(onAddItems.mock.calls[0][0]).toEqual([
      { grnItemId: 'lot-c', quantity: 1, expected: 0 },
      { grnItemId: 'lot-a', quantity: 0, expected: 2 },
    ]);
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
    expect(alertTexts(jest.mocked(showAlert))).toEqual([['Discard selections?', 'Changes to 1 lot have not been saved.']]);
    const buttons = jest.mocked(showAlert).mock.calls[0][2]!;
    expect(buttons.map(button => [button.text, button.style])).toEqual([['Keep editing', 'cancel'], ['Discard selections', 'destructive']]);
    expect(onClose).not.toHaveBeenCalled();

    const presented = mockSheet.present.mock.calls.length;
    await answer('Keep editing');
    expect(onClose).not.toHaveBeenCalled();
    expect(addButtonText()).toBe('Add (1)');
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
    expect(alertTexts(jest.mocked(showAlert))).toEqual([['Discard selections?', 'Changes to 2 lots have not been saved.']]);
    await answer('Discard selections');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAddItems).not.toHaveBeenCalled();
    // The library reporting its own dismissal afterwards does not close a second time.
    await act(async () => { mockSheet.props.onDismiss?.(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledTimes(1);
  });

  it('keeps the selection when the question is closed without an answer', async () => {
    await open([]);
    await choose('Fictional potatoes');
    await leaveBy(way);
    await act(async () => { dismissLatestAlert(jest.mocked(showAlert)); });
    expect(onClose).not.toHaveBeenCalled();
    expect(addButtonText()).toBe('Add (1)');
  });

  it('does nothing while an Add is being saved', async () => {
    onAddItems.mockImplementation(() => new Promise(() => undefined));
    await open([]);
    await choose('Fictional potatoes');
    await pressAdd();
    await leaveBy(way);
    expect(showAlert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(addButtonText()).toBe('Saving 1 of 1…');
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
  await act(async () => { mockSheet.props.onDismiss?.(); });
  // The question on screen answers for the swipe too: it is not asked a second time.
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(mockSheet.present.mock.calls.length - presented).toBe(0);

  await answer('Keep editing');
  expect(mockSheet.present.mock.calls.length - presented).toBe(1);
  expect(mockSheet.dismiss).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(addButtonText()).toBe('Add (1)');
  expect(selectedText('Fictional potatoes')).toBe(true);

  // The sheet is up again, so the same answer the next time does not present it once more.
  await leaveBy(way);
  expect(showAlert).toHaveBeenCalledTimes(2);
  await answer('Keep editing');
  expect(mockSheet.present.mock.calls.length - presented).toBe(1);
  expect(addButtonText()).toBe('Add (1)');
});

it('takes the tap outside itself: the library\'s backdrop is told not to close the sheet', async () => {
  await open([]);
  const backdrop = tree!.root.findByType('Backdrop' as never);
  expect(backdrop.props.pressBehavior).toBe('none');
  // The scrim is one screen-reader stop, named like the Cancel button.
  expect(backdrop.props.accessible).toBe(false);
  expect(node('catalog-scrim').props.accessibilityLabel).toBe('Cancel adding items');
});

describe('Add waits for the server', () => {
  it('stays open with a saving state until every lot is answered, then closes', async () => {
    let settle!: (results: PickerResult[]) => void;
    let progress!: (position: number, total: number) => void;
    onAddItems.mockImplementation((_changes, onProgress) => {
      progress = onProgress;
      return new Promise(resolve => { settle = resolve; });
    });
    await open([]);
    await choose('Fictional potatoes');
    await choose('Fictional onions');
    await pressAdd();

    expect(onAddItems).toHaveBeenCalledTimes(1);
    expect(onAddItems.mock.calls[0][0]).toEqual([{ grnItemId: 'lot-a', quantity: 1, expected: 0 }, { grnItemId: 'lot-b', quantity: 1, expected: 0 }]);
    expect(onClose).not.toHaveBeenCalled();
    expect(addButtonText()).toBe('Saving 1 of 2…');
    // The Add button is a busy, polite live region with nothing to press: a second tap cannot send again.
    const button = node('catalog-add');
    expect(button.props.onPress).toBeUndefined();
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(button.props.accessibilityLiveRegion).toBe('polite');
    expect(button.props.accessibilityLabel).toBe('Saving 1 of 2…');
    // Cancel, the steppers and the presets are off; no swipe down.
    expect(node('catalog-cancel').props.disabled).toBe(true);
    const quantityButtons = tree!.root.findAll(candidate =>
      typeof candidate.props.onPress === 'function' && /^(Add|Remove) \d+ bags? of /.test(String(candidate.props.accessibilityLabel)));
    expect(quantityButtons.length).toBeGreaterThan(8);
    expect(quantityButtons.every(candidate => candidate.props.disabled === true)).toBe(true);
    expect(mockSheet.props.enablePanDownToClose).toBe(false);
    // A stepper pressed anyway changes nothing.
    await pressLabel('Add 1 bag of Fictional garlic');
    expect(selectedText('Fictional garlic')).toBe(false);

    await act(async () => { progress(2, 2); });
    expect(addButtonText()).toBe('Saving 2 of 2…');
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { settle([{ grnItemId: 'lot-a', ok: true }, { grnItemId: 'lot-b', ok: true }]); });
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
    await act(async () => { tree!.root.findByType(TextInput).props.onChangeText('Fictional'); });
    expect(tree!.root.findByType('CatalogList' as never).props.getItemLayout).toEqual(expect.any(Function));
    await pressAdd();

    expect(onClose).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(addButtonText()).toBe('Add (1)');
    expect(node('catalog-cancel').props.disabled).toBe(false);
    expect(mockSheet.props.enablePanDownToClose).toBe(true);
    // The reason is on the failed lot's row and on no other.
    expect(textOf(node('catalog-reason-lot-b'))).toBe('Only 3 bags in stock.');
    expect(tree!.root.findAll(candidate => /^catalog-reason-/.test(String(candidate.props.testID)))
      .every(candidate => candidate.props.testID === 'catalog-reason-lot-b')).toBe(true);
    expect(textOf(node('catalog-not-saved-summary'))).toBe('1 lot was not saved. See the reason on it.');
    // The search is cleared, the failed lot is first, and the taller row is measured, not estimated.
    expect(tree!.root.findByType(TextInput).props.value).toBe('');
    expect(listedLots()[0]).toBe('lot-b');
    expect(tree!.root.findByType('CatalogList' as never).props.getItemLayout).toBeUndefined();
    // Both lots keep their quantities on screen; only the failed one is still to send.
    expect(selectedText('Fictional potatoes')).toBe(true);
    expect(selectedText('Fictional onions')).toBe(true);

    await pressAdd();
    expect(onAddItems).toHaveBeenCalledTimes(2);
    expect(onAddItems.mock.calls[1][0]).toEqual([{ grnItemId: 'lot-b', quantity: 1, expected: 0 }]);
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
    expect(addButtonText()).toBe('Add (2)');
    expect(textOf(node('catalog-not-saved-summary'))).toBe('2 lots were not saved. See the reason on each.');
    expect(listedLots().slice(0, 2)).toEqual(['lot-a', 'lot-b']);

    await pressLabel('Remove 1 bag of Fictional potatoes');
    expect(node('catalog-reason-lot-a')).toBeUndefined();
    expect(textOf(node('catalog-reason-lot-b'))).toBe('Only 3 bags in stock.');
    expect(addButtonText()).toBe('Add (1)');
  });

  it('treats a lot without an answer, or a save that threw, as not saved', async () => {
    onAddItems.mockResolvedValueOnce([{ grnItemId: 'lot-a', ok: true }]);
    await open([]);
    await choose('Fictional potatoes');
    await choose('Fictional onions');
    await pressAdd();
    expect(onClose).not.toHaveBeenCalled();
    expect(textOf(node('catalog-reason-lot-b'))).toBe('Not saved. Check your connection and try again.');

    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    onAddItems.mockRejectedValueOnce(new Error('fictional failure'));
    await pressAdd();
    expect(logged).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(addButtonText()).toBe('Add (1)');
    expect(textOf(node('catalog-reason-lot-b'))).toBe('Not saved. Check your connection and try again.');
  });

  it('shows the sheet again for the lots not saved when it was swiped away just as Add was tapped', async () => {
    let settle!: (results: PickerResult[]) => void;
    onAddItems.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
    await open([]);
    await choose('Fictional potatoes');
    await pressAdd();
    // A swipe already under way when saving began: the library dismisses the sheet.
    const presented = mockSheet.present.mock.calls.length;
    await act(async () => { mockSheet.props.onDismiss?.(); });
    expect(showAlert).not.toHaveBeenCalled();
    await act(async () => { settle([{ grnItemId: 'lot-a', ok: false, reason: 'Only 3 bags in stock.' }]); });
    expect(mockSheet.present.mock.calls.length - presented).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(textOf(node('catalog-reason-lot-a'))).toBe('Only 3 bags in stock.');
  });

  it('sends nothing when only saved lots are selected and none changed, and asks for a choice when nothing is', async () => {
    await open([saved('lot-a', 2)]);
    await pressAdd();
    expect(onAddItems).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => { tree!.unmount(); });
    onClose.mockClear();
    await open([]);
    await pressAdd();
    expect(onAddItems).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(alertTexts(jest.mocked(showAlert))).toEqual([['No items selected', 'Choose a quantity for at least one item, then tap Add.']]);
  });
});
