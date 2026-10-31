/**
 * Leaving the dispatch items step (phone review 2026-10-14, UX-01, Dispatch part).
 *
 * The step holds one item in its form. The footer's Next saves a valid item
 * (new, or a correction of a saved one) and goes to Review; the footer's Back
 * asks "Go back to details?" when items would be left behind. The other ways
 * out did neither:
 *
 * - the Review circle went straight to Review, so a correction still in the
 *   form was reviewed with its old value;
 * - the Details circle, a swipe to the right and the phone's Back key went
 *   straight to step 1, without the question;
 * - Next with a correction that cannot be saved (no bags, or more than the lot
 *   holds) went to Review with the old value, without a word.
 *
 * Dispatch saves without a prompt (the owner's decision): there is no
 * "Save this item?" question here, unlike the GRN step.
 */
import React from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';
import type { MutableRefObject } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { getTokens, space } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import type { DispatchItemData } from '@/types/dispatch.types';
import { DispatchItemsStep } from '../DispatchItemsStep';
import DispatchFormStep2 from '../../../../../app/dispatch-form/step2';
import DispatchEditStep2 from '../../../../../app/dispatch-edit/[id]/step2';

const CUSTOMER = '22222222-3333-4444-8555-666666666666';
const GRN = '11111111-2222-4333-8444-555555555555';
const ITEM = '33333333-4444-4555-8666-777777777777';
const LOT = '44444444-5555-4666-8777-888888888888';
const OTHER_LOT = '55555555-6666-4777-8888-999999999999';

/** A saved line: 5 bags of a lot that still holds `grnItems_stock` more. */
const saved = (over: Partial<DispatchItemData> = {}): DispatchItemData => ({
  unique_id: 'line-1',
  grns_id: GRN,
  grns_gr_no: 'G0311',
  grns_date: '2026-10-01',
  grns_customer_name: 'Example Traders',
  grns_customer_id: CUSTOMER,
  grnItems_id: LOT,
  grnItems_item_id: ITEM,
  grnItems_item_name: 'Example Potatoes',
  grnItems_quantity: 100,
  grnItems_stock: 95,
  grnItems_package_mark: 'M1',
  grnItems_rack: 'R1',
  grnItems_weight: 50,
  disp_quantity: 5,
  ...over,
});

const mockForm = {
  header: { disp_no: 'DD0001', customer_id: CUSTOMER, customer_name: 'Example Traders' },
  items: [] as DispatchItemData[],
  // The bags the saved dispatch held per lot when it was read (an edited dispatch only)
  heldBags: {} as Record<string, number>,
  isCreateMode: true,
  addFormItems: jest.fn(),
  updateFormItem: jest.fn(),
  removeFormItem: jest.fn(),
  navigateToStep: jest.fn(async (_step: number) => true),
  resetFormState: jest.fn(),
};

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('expo-router', () => {
  const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    // The screen is in focus for as long as it is mounted.
    useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
  };
});
// The routes take the step from the folder's index, which also loads steps 1 and 3.
jest.mock('@/features/dispatch/screens', () => ({
  DispatchItemsStep: jest.requireActual('@/features/dispatch/screens/DispatchItemsStep').DispatchItemsStep,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: mockInsetBottom, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
// Stand-ins that keep their props, so the test can press what they offer.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: 'SwipeableFormStep' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: 'DispatchStepIndicator', dispatchSteps: () => [] }));
jest.mock('@/features/dispatch/components', () => ({
  GRNAutocompleteBottomSheet: 'GRNAutocompleteBottomSheet',
  GRNItemBottomSheet: 'GRNItemBottomSheet',
  LotBottomSheet: 'LotBottomSheet',
  ItemsSummaryBottomSheet: 'ItemsSummaryBottomSheet',
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

let mockInsetBottom = 0;
const DETAILS = 1;
const REVIEW = 3;
const tokens = getTokens('orange', 'light');

const stub = (tree: ReactTestRenderer, name: string) => tree.root.find((node) => (node.type as unknown) === name);
const indicator = (tree: ReactTestRenderer) => stub(tree, 'DispatchStepIndicator');
const swipe = (tree: ReactTestRenderer) => stub(tree, 'SwipeableFormStep');
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label);
const bags = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Bags to dispatch')!;
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
/** The "Go back to details?" question, as the step hands it to ConfirmDialog. */
const backQuestion = (tree: ReactTestRenderer) =>
  tree.root.find((node) => (node.type as unknown) === 'ConfirmDialog' && node.props.title === 'Go back to details?');
/** The colour of the quantity field's label: the error colour while the field is marked. */
const quantityLabelColor = (tree: ReactTestRenderer) =>
  StyleSheet.flatten(
    tree.root.find((node) => (node.type as unknown) === 'Text' && [node.props.children].flat()[0] === 'Bags to dispatch').props.style
  ).color;

const type = async (tree: ReactTestRenderer, text: string) => {
  await act(async () => { bags(tree).props.onChangeText(text); });
};
/** Opens a saved line in the form, as "Edit" in the saved-items sheet does. */
const correct = async (tree: ReactTestRenderer, line: DispatchItemData) => {
  await act(async () => { await stub(tree, 'ItemsSummaryBottomSheet').props.onEditItem(line); });
};
const press = async (tree: ReactTestRenderer, how: () => unknown) => {
  await act(async () => { await how(); });
};

let tree: ReactTestRenderer;
let back: ReturnType<typeof installHardwareBack>;
const mount = async (element: React.ReactElement) => {
  await act(async () => { tree = create(element); });
  return tree;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockForm.items = [];
  mockForm.heldBags = {};
  mockForm.isCreateMode = true;
  mockForm.navigateToStep.mockImplementation(async () => true);
  back = installHardwareBack();
  // The GRN of the saved line, with the lot as the line holds it.
  jest.mocked(getGRNDetailByNumber).mockImplementation(async () => {
    const line = mockForm.items[0] ?? saved();
    return {
      success: true,
      data: {
        grn: { id: GRN, gr_no: 'G0311', date: '2026-10-01', customer_id: CUSTOMER, customer_name: 'Example Traders' },
        items: [
          { id: LOT, item_id: ITEM, item_name: 'Example Potatoes', quantity: 100, stock: line.grnItems_stock, package_mark: 'M1', rack: 'R1', weight: 50 },
          { id: OTHER_LOT, item_id: ITEM, item_name: 'Example Potatoes', quantity: 40, stock: 40, package_mark: 'M2', rack: 'R2', weight: 50 },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>;
  });
});
afterEach(async () => {
  // The step focuses the quantity field half a second after a line is opened.
  await act(async () => { tree.unmount(); });
  back.restore();
  jest.restoreAllMocks();
});

describe('the Review circle saves as Next does', () => {
  it('a correction from 5 to 7 bags is saved, then Review opens', async () => {
    mockForm.items = [saved()];
    await mount(<DispatchItemsStep mode="create" />);
    await correct(tree, mockForm.items[0]);
    expect(bags(tree).props.value).toBe('5');
    await type(tree, '7');

    await press(tree, () => indicator(tree).props.onStepPress(REVIEW));

    expect(mockForm.updateFormItem).toHaveBeenCalledTimes(1);
    expect(mockForm.updateFormItem).toHaveBeenCalledWith('line-1', expect.objectContaining({ unique_id: 'line-1', disp_quantity: 7 }));
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
    // Saved first, then Review: the other way round Review would show 5.
    expect(mockForm.updateFormItem.mock.invocationCallOrder[0]).toBeLessThan(mockForm.navigateToStep.mock.invocationCallOrder[0]);
    // Without a question (the owner's decision for Dispatch).
    expect(showAlert).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
  });

  it('a new item that is complete is added, then Review opens', async () => {
    await mount(<DispatchItemsStep mode="create" />);
    // Choosing a GRN puts its first lot with stock in the form.
    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type(tree, '4');

    await press(tree, () => indicator(tree).props.onStepPress(REVIEW));

    expect(mockForm.addFormItems).toHaveBeenCalledTimes(1);
    expect(mockForm.addFormItems).toHaveBeenCalledWith([expect.objectContaining({ grnItems_id: LOT, disp_quantity: 4 })]);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
    expect(mockForm.addFormItems.mock.invocationCallOrder[0]).toBeLessThan(mockForm.navigateToStep.mock.invocationCallOrder[0]);
  });

  it('with an empty form and no saved items it says "Add an item first" and stays', async () => {
    await mount(<DispatchItemsStep mode="create" />);

    await press(tree, () => indicator(tree).props.onStepPress(REVIEW));

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Add an item first', 'Add at least one item before you continue.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
  });

  it('with saved items and an empty form it opens Review, and saves nothing', async () => {
    mockForm.items = [saved()];
    await mount(<DispatchItemsStep mode="create" />);

    await press(tree, () => indicator(tree).props.onStepPress(REVIEW));

    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });
});

describe('every way back asks "Go back to details?" as the footer\'s Back does', () => {
  const ways: [string, (guard: MutableRefObject<(() => void) | null>) => unknown][] = [
    ['the footer\'s Back', () => button(tree, 'Back to dispatch details').props.onPress()],
    ['the Details circle', () => indicator(tree).props.onStepPress(DETAILS)],
    ['a swipe to the right', () => swipe(tree).props.onSwipeRight()],
    ['the Back key\'s guard', (guard) => guard.current!()],
  ];

  it.each(ways)('%s, with saved items: the question, and step 1 only after "Go back"', async (_name, leave) => {
    mockForm.items = [saved()];
    const guard: MutableRefObject<(() => void) | null> = { current: null };
    await mount(<DispatchItemsStep mode="create" backGuard={guard} />);
    expect(backQuestion(tree).props.visible).toBe(false);

    await press(tree, () => leave(guard));

    expect(backQuestion(tree).props).toMatchObject({ visible: true, title: 'Go back to details?', confirmText: 'Go back', cancelText: 'Stay' });
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();

    // "Stay" closes the question and goes nowhere.
    await press(tree, () => backQuestion(tree).props.onCancel());
    expect(backQuestion(tree).props.visible).toBe(false);
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();

    // Asked again, "Go back" goes to step 1.
    await press(tree, () => leave(guard));
    await press(tree, () => backQuestion(tree).props.onConfirm());
    expect(backQuestion(tree).props.visible).toBe(false);
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(DETAILS);
  });

  it.each(ways)('%s, with nothing to lose: step 1 at once', async (_name, leave) => {
    const guard: MutableRefObject<(() => void) | null> = { current: null };
    await mount(<DispatchItemsStep mode="create" backGuard={guard} />);

    await press(tree, () => leave(guard));

    expect(backQuestion(tree).props.visible).toBe(false);
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(DETAILS);
  });

  it('the guard follows the form: nothing saved, then a complete item typed', async () => {
    const guard: MutableRefObject<(() => void) | null> = { current: null };
    await mount(<DispatchItemsStep mode="create" backGuard={guard} />);
    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type(tree, '4');

    await press(tree, () => guard.current!());

    expect(backQuestion(tree).props.visible).toBe(true);
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
  });

  it('the guard is taken away when the step is left', async () => {
    const guard: MutableRefObject<(() => void) | null> = { current: null };
    await mount(<DispatchItemsStep mode="create" backGuard={guard} />);
    expect(guard.current).toEqual(expect.any(Function));

    await act(async () => { tree.unmount(); });

    expect(guard.current).toBeNull();
  });
});

describe('the phone\'s Back key on the step itself', () => {
  const routes: [string, boolean, React.ReactElement][] = [
    ['a new dispatch', true, <DispatchFormStep2 key="create" />],
    ['an edited dispatch', false, <DispatchEditStep2 key="edit" />],
  ];

  it.each(routes)('%s, with saved items: the question, and step 1 only after "Go back"', async (_name, isCreateMode, route) => {
    mockForm.items = [saved()];
    mockForm.isCreateMode = isCreateMode;
    await mount(route);

    let taken = false;
    await act(async () => { taken = back.press(); });

    expect(taken).toBe(true);
    expect(backQuestion(tree).props.visible).toBe(true);
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();

    await press(tree, () => backQuestion(tree).props.onConfirm());
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(DETAILS);
    // One listener for the route, however often the step drew itself.
    expect(back.count()).toBe(1);
  });
});

describe('Next stops on a correction that cannot be saved', () => {
  const ways: [string, () => unknown][] = [
    ['the footer\'s Next', () => button(tree, 'Next, review dispatch').props.onPress()],
    ['the Review circle', () => indicator(tree).props.onStepPress(REVIEW)],
    ['a swipe to the left', () => swipe(tree).props.onSwipeLeft()],
  ];

  it.each(ways)('%s, with more bags than the lot holds: the alert, the field marked, and it stays', async (_name, goOn) => {
    // 5 of this lot are in the dispatch and 5 more are in stock: 10 is the most.
    mockForm.items = [saved({ grnItems_stock: 5, original_disp_quantity: 5 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(tree, mockForm.items[0]);
    await type(tree, '11');

    await press(tree, goOn);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    // The field is marked and says why, once: the limit with its number.
    expect(quantityLabelColor(tree)).toBe(tokens.status.negative.text);
    expect(texts(tree)).toContain('Enter 10 bags or fewer. That is the original stock.');
    expect(texts(tree)).not.toContain('Quantity cannot exceed available stock');
    // What was typed stays in the form, still as a correction of the same line.
    expect(bags(tree).props.value).toBe('11');
    expect(texts(tree)).toContain('Editing item 1');
  });

  it('with the bags cleared: the alert, and the field is marked with the reason only now', async () => {
    mockForm.items = [saved()];
    await mount(<DispatchItemsStep mode="create" />);
    await correct(tree, mockForm.items[0]);
    await type(tree, '');
    expect(quantityLabelColor(tree)).not.toBe(tokens.status.negative.text);
    expect(texts(tree)).not.toContain('Quantity must be at least 1');

    await press(tree, () => button(tree, 'Next, review dispatch').props.onPress());

    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(quantityLabelColor(tree)).toBe(tokens.status.negative.text);
    expect(texts(tree)).toContain('Quantity must be at least 1');
  });

  // "12.5" counts as no bags, and the check of that 0 used to put "at least 1" in place of the reason shown.
  it('with "12.5" typed: the text stays in the field with the reason it was already given', async () => {
    mockForm.items = [saved()];
    await mount(<DispatchItemsStep mode="create" />);
    await correct(tree, mockForm.items[0]);
    await type(tree, '12.5');
    expect(texts(tree)).toContain('Quantity must be a whole number');

    await press(tree, () => button(tree, 'Next, review dispatch').props.onPress());

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(bags(tree).props.value).toBe('12.5');
    expect(quantityLabelColor(tree)).toBe(tokens.status.negative.text);
    expect(texts(tree)).toContain('Quantity must be a whole number');
    expect(texts(tree)).not.toContain('Quantity must be at least 1');
  });

  it('a corrected number of bags within the limit goes on after the stop', async () => {
    mockForm.items = [saved({ grnItems_stock: 5, original_disp_quantity: 5 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(tree, mockForm.items[0]);
    await type(tree, '11');
    await press(tree, () => button(tree, 'Next, review dispatch').props.onPress());
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();

    await type(tree, '10');
    await press(tree, () => button(tree, 'Next, review dispatch').props.onPress());

    expect(mockForm.updateFormItem).toHaveBeenCalledWith('line-1', expect.objectContaining({ disp_quantity: 10 }));
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
  });

  it('a new item that is only part filled is left as it was: Review opens with the saved items', async () => {
    mockForm.items = [saved({ grnItems_id: OTHER_LOT })];
    await mount(<DispatchItemsStep mode="create" />);
    // A GRN and its lot are chosen, the bags are not typed yet.
    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));
    expect(texts(tree)).toContain('Adding item 2');

    await press(tree, () => button(tree, 'Next, review dispatch').props.onPress());

    expect(showAlert).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
  });
});

// The stop above left a new dispatch with no way on: Next, the Review circle and
// a swipe left all stopped, "Clear this item" is not offered for a correction,
// and the strip with "Stop editing this item" was drawn for an edited dispatch only.
describe('a correction can be given up, in a new dispatch as in an edited one', () => {
  const stopEditing = (step: ReactTestRenderer) =>
    step.root.findAll((node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Stop editing this item');
  /** The "Discard changes to this item?" question, as the step hands it to ConfirmDialog. */
  const discardQuestion = (step: ReactTestRenderer) =>
    step.root.find((node) => (node.type as unknown) === 'ConfirmDialog' && node.props.title === 'Discard changes to this item?');
  const next = () => button(tree, 'Next, review dispatch').props.onPress();

  /** The step of a dispatch with one saved line: 5 bags of a lot that has 95 more in stock. */
  const withSavedLine = async (isCreateMode: boolean) => {
    mockForm.items = [saved()];
    mockForm.isCreateMode = isCreateMode;
    await mount(<DispatchItemsStep mode={isCreateMode ? 'create' : 'edit'} />);
  };
  /** That line opened in the form. */
  const correcting = async (isCreateMode: boolean) => {
    await withSavedLine(isCreateMode);
    await correct(tree, mockForm.items[0]);
  };
  /** The form as it is for a new, second item: nothing chosen, nothing typed, nothing marked. */
  const expectNewItemForm = () => {
    expect(stopEditing(tree)).toHaveLength(0);
    expect(texts(tree)).toContain('Adding item 2');
    expect(texts(tree)).not.toContain('Editing item 1');
    expect(texts(tree)).toContain('Choose GRN');
    expect(bags(tree).props.value).toBe('');
    expect(bags(tree).props.editable).toBe(false);
    expect(quantityLabelColor(tree)).not.toBe(tokens.status.negative.text);
    expect(texts(tree).filter((text) => text.startsWith('Quantity must') || text.startsWith('Enter '))).toEqual([]);
  };

  it.each([
    ['a new dispatch', true],
    ['an edited dispatch', false],
  ])('%s: the strip names the item being corrected and offers "Stop editing this item"', async (_name, isCreateMode) => {
    await withSavedLine(isCreateMode);
    // Not while the form holds a new item.
    expect(stopEditing(tree)).toHaveLength(0);

    await correct(tree, mockForm.items[0]);

    expect(stopEditing(tree)).toHaveLength(1);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Editing item 1', 'Editing item', 'Example Potatoes (GRN G0311)']));
  });

  it.each([
    // A line of a new dispatch holds no bags yet: its limit is the stock still available.
    ['more bags than the lot holds', '96', 'Enter 95 bags or fewer. That is the available stock.'],
    ['the bags cleared', '', 'Quantity must be at least 1'],
    ['bags that are not a whole number', '12.5', 'Quantity must be a whole number'],
  ])('a new dispatch, %s: Next stops, the correction is given up, and Next opens Review', async (_what, typed, reason) => {
    await correcting(true);
    await type(tree, typed);

    await press(tree, next);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(texts(tree)).toContain(reason);
    expect(bags(tree).props.value).toBe(typed);

    // The way out: it asks first, because the number of bags was changed.
    expect(discardQuestion(tree).props.visible).toBe(false);
    await press(tree, () => stopEditing(tree)[0].props.onPress());
    expect(discardQuestion(tree).props).toMatchObject({ visible: true, confirmText: 'Discard changes', cancelText: 'Keep editing' });
    expect(bags(tree).props.value).toBe(typed);
    await press(tree, () => discardQuestion(tree).props.onConfirm());

    expect(discardQuestion(tree).props.visible).toBe(false);
    expectNewItemForm();
    // The saved line was not written to: it still holds its 5 bags.
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.removeFormItem).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    expect(mockForm.items).toEqual([saved()]);

    await press(tree, next);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
  });

  it('a new dispatch: "Keep editing" leaves the correction in the form as typed', async () => {
    await correcting(true);
    await type(tree, '96');
    await press(tree, () => stopEditing(tree)[0].props.onPress());

    await press(tree, () => discardQuestion(tree).props.onCancel());

    expect(discardQuestion(tree).props.visible).toBe(false);
    expect(stopEditing(tree)).toHaveLength(1);
    expect(texts(tree)).toContain('Editing item 1');
    expect(bags(tree).props.value).toBe('96');
  });

  it('a new dispatch: a correction with nothing changed is given up without a question', async () => {
    await correcting(true);
    expect(bags(tree).props.value).toBe('5');

    await press(tree, () => stopEditing(tree)[0].props.onPress());

    expect(discardQuestion(tree).props.visible).toBe(false);
    expectNewItemForm();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
  });
});

describe('the bottom bar is the shared WizardBottomBar (R1-08)', () => {
  const barStyle = () => {
    const next = button(tree, 'Next, review dispatch');
    // The bar is the nearest ancestor that holds both buttons.
    let bar = next.parent!;
    while (bar.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Back to dispatch details').length === 0) bar = bar.parent!;
    return StyleSheet.flatten(bar.props.style) as { paddingBottom: number };
  };
  const setOS = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);
  afterEach(() => { mockInsetBottom = 0; });

  it('Android: pads by space.md only, with a 34 dp navigation bar inset (the root stack already pads the screen)', async () => {
    setOS('android');
    mockInsetBottom = 34;
    await mount(<DispatchItemsStep mode="create" />);
    // The old bar here added the inset again: 34 + space.md.
    expect(barStyle().paddingBottom).toBe(space.md);
  });

  it('iOS: adds the inset to space.md', async () => {
    setOS('ios');
    mockInsetBottom = 34;
    await mount(<DispatchItemsStep mode="create" />);
    expect(barStyle().paddingBottom).toBe(34 + space.md);
  });

  it('keeps its spoken labels, and shows "Add item" and "Review" (Back is an icon)', async () => {
    await mount(<DispatchItemsStep mode="create" />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Add item', 'Review']));
    expect(texts(tree)).not.toContain('Next');
    expect(button(tree, 'Back to dispatch details')).toBeTruthy();
    expect(button(tree, 'Next, review dispatch')).toBeTruthy();
  });

  it('keeps Add item and the check mark pressable with an empty line (owner decision D7)', async () => {
    await mount(<DispatchItemsStep mode="create" />);
    expect(button(tree, 'Add item').props.disabled).toBeFalsy();
    expect(button(tree, 'Save item').props.disabled).toBeFalsy();
  });
});

// Review 2026-10-20 (M3): a new line the person filled in (a lot and bags) that cannot be saved is not dropped on the way
// to Review. A line with no bags typed is still left behind (pinned above).
describe('Next with a new line that cannot be saved', () => {
  const next = () => button(tree, 'Next, review dispatch').props.onPress();

  it('more bags than the stock: the alert, the field marked, and it stays', async () => {
    mockForm.items = [saved({ grnItems_id: OTHER_LOT })];
    await mount(<DispatchItemsStep mode="create" />);
    // The GRN's first lot with stock is chosen: 95 bags in it. 120 is more.
    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type(tree, '120');

    await press(tree, next);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    expect(quantityLabelColor(tree)).toBe(tokens.status.negative.text);
    expect(texts(tree)).toContain('Enter 95 bags or fewer. That is the available stock.');
    // What was typed stays in the form.
    expect(bags(tree).props.value).toBe('120');
  });

  it('with nothing saved yet the check of the line comes first, not "Add an item first" (review 2026-10-20, M3)', async () => {
    await mount(<DispatchItemsStep mode="create" />);
    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type(tree, '120');

    await press(tree, next);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Enter 95 bags or fewer. That is the available stock.');
  });

  it('after the number is brought within the stock, Next saves the line and goes on', async () => {
    mockForm.items = [saved({ grnItems_id: OTHER_LOT })];
    await mount(<DispatchItemsStep mode="create" />);
    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type(tree, '120');
    await press(tree, next);
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();

    await type(tree, '90');
    await press(tree, next);

    expect(mockForm.addFormItems).toHaveBeenCalledWith([expect.objectContaining({ grnItems_id: LOT, disp_quantity: 90 })]);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
  });
});

// Review 2026-10-20 (M2, A11): in an edited dispatch, a line's GRN, item and lot go together, and the bags the saved
// line holds count only on its own lot.
describe('changing the GRN or the lot of a line of an edited dispatch', () => {
  const GRN_B = '66666666-7777-4888-8999-000000000000';
  const LOT_B = '77777777-8888-4999-8000-111111111111';
  const lotB = { id: LOT_B, item_id: ITEM, item_name: 'Example Potatoes', quantity: 60, stock: 30, package_mark: 'M3', rack: 'R3', weight: 50 };
  const lotOf = (id: string, stock: number) => ({ id, item_id: ITEM, item_name: 'Example Potatoes', quantity: 100, stock, package_mark: 'M1', rack: 'R1', weight: 50 });

  const openLine = async () => {
    // 5 bags are in the dispatch, 5 more are in stock: the lot allows 10.
    mockForm.items = [saved({ grnItems_stock: 5, original_disp_quantity: 5 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    jest.mocked(getGRNDetailByNumber).mockImplementation(async (grNo: string) => {
      const other = grNo === 'G0400';
      return {
        success: true,
        data: {
          grn: { id: other ? GRN_B : GRN, gr_no: grNo, date: '2026-10-01', customer_id: CUSTOMER, customer_name: 'Example Traders' },
          items: other ? [lotB] : [lotOf(LOT, 5), lotOf(OTHER_LOT, 40)],
        },
      } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>;
    });
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(tree, mockForm.items[0]);
  };
  const chooseOtherGrn = () => press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN_B, gr_no: 'G0400' }));
  const chooseLot = (lot: ReturnType<typeof lotOf>) => press(tree, () => stub(tree, 'LotBottomSheet').props.onSelect(lot));
  const chooseItem = () => press(tree, () => stub(tree, 'GRNItemBottomSheet').props.onSelect({ item_id: ITEM, item_name: 'Example Potatoes' }));

  it('another GRN clears the line\'s item, lot and bags, so the old lot cannot be saved under the new GRN', async () => {
    await openLine();
    expect(texts(tree)).toContain('G0311');
    expect(bags(tree).props.value).toBe('5');

    await chooseOtherGrn();

    expect(texts(tree)).toContain('G0400');
    expect(texts(tree)).toContain('Choose item');
    expect(texts(tree)).toContain('Choose lot');
    expect(texts(tree)).not.toContain('GRN qty 100 · 5 in stock');
    expect(bags(tree).props.value).toBe('');

    // Next does not save the line as it is: the lot of the old GRN would be saved under the new one.
    await press(tree, () => button(tree, 'Next, review dispatch').props.onPress());
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
  });

  it('the item and lot of the new GRN are what is saved', async () => {
    await openLine();
    await chooseOtherGrn();
    await chooseItem();
    await chooseLot(lotB);
    await type(tree, '12');

    await press(tree, () => button(tree, 'Next, review dispatch').props.onPress());

    expect(mockForm.updateFormItem).toHaveBeenCalledTimes(1);
    expect(mockForm.updateFormItem).toHaveBeenCalledWith('line-1', expect.objectContaining({
      grns_id: GRN_B,
      grns_gr_no: 'G0400',
      grnItems_id: LOT_B,
      disp_quantity: 12,
      original_disp_quantity: 0,
    }));
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
  });

  it('the same GRN chosen again keeps the line as it is', async () => {
    await openLine();

    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));

    expect(texts(tree)).toContain('GRN qty 100 · 5 in stock');
    expect(bags(tree).props.value).toBe('5');
  });

  it('another lot has none of the bags the line holds: its limit is its own stock', async () => {
    await openLine();
    await chooseLot(lotOf(OTHER_LOT, 10));

    // 12 is within 10 + 5 (the saved lot's 5 do not belong to this lot) but over the 10 this lot holds.
    await type(tree, '12');
    expect(texts(tree)).toContain('Enter 10 bags or fewer. That is the available stock.');
    expect(quantityLabelColor(tree)).toBe(tokens.status.negative.text);

    await type(tree, '10');
    expect(texts(tree)).not.toContain('Enter 10 bags or fewer. That is the available stock.');
    expect(quantityLabelColor(tree)).not.toBe(tokens.status.negative.text);
  });

  it('choosing the saved lot again gives the line its bags back', async () => {
    await openLine();
    await chooseLot(lotOf(OTHER_LOT, 10));
    await chooseLot(lotOf(LOT, 5));

    await type(tree, '11');
    expect(texts(tree)).toContain('Enter 10 bags or fewer. That is the original stock.');
    await type(tree, '10');
    expect(texts(tree)).not.toContain('Enter 10 bags or fewer. That is the original stock.');
  });

  // The bags are those the dispatch held when it was read, per lot: not what a line says after it was moved (A11).
  it('a line moved to another lot and back finds the bags the dispatch held on the first lot', async () => {
    // The dispatch held 5 bags on LOT. In this form the line sits on OTHER_LOT (moved there and saved), so it carries
    // none of them itself.
    mockForm.items = [saved({ grnItems_id: OTHER_LOT, grnItems_stock: 40, original_disp_quantity: 0 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(tree, mockForm.items[0]);

    await chooseLot(lotOf(LOT, 5));

    // 5 in stock and the 5 the dispatch held on this lot: 10 is the most (it was 5 when the held bags followed the line).
    await type(tree, '11');
    expect(texts(tree)).toContain('Enter 10 bags or fewer. That is the original stock.');
    await type(tree, '10');
    expect(texts(tree)).not.toContain('Enter 10 bags or fewer. That is the original stock.');
    expect(quantityLabelColor(tree)).not.toBe(tokens.status.negative.text);
  });

  it('a new line on a lot the dispatch held (its own line was removed) may take those bags too', async () => {
    mockForm.items = [];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));
    await chooseItem();
    await chooseLot(lotOf(LOT, 5));

    await type(tree, '11');
    expect(texts(tree)).toContain('Enter 10 bags or fewer. That is the original stock.');
    await type(tree, '10');
    expect(quantityLabelColor(tree)).not.toBe(tokens.status.negative.text);
  });

  it('a lot the dispatch did not hold has only its own stock, in an edit as in a new dispatch', async () => {
    mockForm.items = [];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await press(tree, () => stub(tree, 'GRNAutocompleteBottomSheet').props.onSelect({ id: GRN, gr_no: 'G0311' }));
    await chooseItem();
    await chooseLot(lotOf(OTHER_LOT, 10));

    await type(tree, '11');
    expect(texts(tree)).toContain('Enter 10 bags or fewer. That is the available stock.');
  });
});
