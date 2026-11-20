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
import { Platform } from 'react-native';
import type { MutableRefObject } from 'react';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
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
  isChanged: false,
  addFormItems: jest.fn(),
  updateFormItem: jest.fn(),
  removeFormItem: jest.fn(),
  navigateToStep: jest.fn(async (_step: number) => true),
  resetFormState: jest.fn(),
};

/** The props the step gave to the stand-ins below (the ones that have nothing on screen to press), as drawn last. */
const mockProps: {
  indicator?: { onStepPress: (step: number) => unknown; backOnFirstStep: { hasData: boolean } };
  swipe?: { onSwipeRight: () => unknown; onSwipeLeft: () => unknown };
  grn?: { onSelect: (grn: { id: string; gr_no: string }) => unknown };
  item?: { onSelect: (item: { item_id: string; item_name: string }) => unknown };
  lot?: { onSelect: (lot: unknown) => unknown };
  summary?: { onEditItem: (line: DispatchItemData) => unknown };
} = {};

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
// Stand-ins. The dialog shows its title, and its two buttons while it is visible, so the test reads and presses what a
// person would see. The others keep the props the step gave them, so the test can call what they offer.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: ({ visible, title, confirmText, cancelText, onConfirm, onCancel }: {
    visible: boolean; title: string; confirmText: string; cancelText: string; onConfirm: () => void; onCancel: () => void;
  }) => {
    if (!visible) return null;
    const { createElement } = jest.requireActual('react');
    const { Pressable, Text, View } = jest.requireActual('react-native');
    return createElement(
      View,
      null,
      createElement(Text, null, title),
      createElement(Pressable, { accessibilityRole: 'button', onPress: onConfirm }, createElement(Text, null, confirmText)),
      createElement(Pressable, { accessibilityRole: 'button', onPress: onCancel }, createElement(Text, null, cancelText)),
    );
  },
}));
jest.mock('@/components/SwipeableFormStep', () => ({
  __esModule: true,
  default: (props: { children: unknown; onSwipeRight: () => unknown; onSwipeLeft: () => unknown }) => {
    mockProps.swipe = props;
    return props.children;
  },
}));
jest.mock('@/components/DispatchStepIndicator', () => ({
  DispatchStepIndicator: (props: NonNullable<typeof mockProps.indicator>) => {
    mockProps.indicator = props;
    return null;
  },
  dispatchSteps: () => [],
}));
jest.mock('@/features/dispatch/components', () => ({
  GRNAutocompleteBottomSheet: (props: NonNullable<typeof mockProps.grn>) => {
    mockProps.grn = props;
    return null;
  },
  GRNItemBottomSheet: (props: NonNullable<typeof mockProps.item>) => {
    mockProps.item = props;
    return null;
  },
  LotBottomSheet: (props: NonNullable<typeof mockProps.lot>) => {
    mockProps.lot = props;
    return null;
  },
  ItemsSummaryBottomSheet: (props: NonNullable<typeof mockProps.summary>) => {
    mockProps.summary = props;
    return null;
  },
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

let mockInsetBottom = 0;
const DETAILS = 1;
const REVIEW = 3;
const tokens = getTokens('orange', 'light');

const indicator = () => mockProps.indicator!;
const swipe = () => mockProps.swipe!;
const pressButton = (name: string) => userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name }));
const bags = () => screen.getByLabelText('Bags to dispatch');
const shows = (text: string | RegExp) => expect(screen.getByText(text)).toBeOnTheScreen();
const hides = (text: string | RegExp) => expect(screen.queryByText(text)).not.toBeOnTheScreen();
/** The "Go back to details?" question, as the step hands it to ConfirmDialog. */
const BACK_QUESTION = 'Go back to details?';
/** The quantity field's label: in the error colour while the field is marked. */
const quantityLabel = () => screen.getByText(/^Bags to dispatch/);

const type = async (text: string) => {
  const user = userEvent.setup({ delay: 0 });
  await user.clear(bags());
  if (text) await user.paste(bags(), text);
};
/** Opens a saved line in the form, as "Edit" in the saved-items sheet does. */
const correct = (line: DispatchItemData) => call(() => mockProps.summary!.onEditItem(line));
const call = async (how: () => unknown) => {
  await act(async () => { await how(); });
};

let back: ReturnType<typeof installHardwareBack>;
const mount = async (element: React.ReactElement) => {
  await render(element);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  Object.keys(mockProps).forEach((key) => delete mockProps[key as keyof typeof mockProps]);
  mockForm.items = [];
  mockForm.heldBags = {};
  mockForm.isCreateMode = true;
  mockForm.isChanged = false;
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
afterEach(() => {
  // The step focuses the quantity field half a second after a line is opened; Testing Library unmounts the tree.
  back.restore();
  jest.restoreAllMocks();
});

describe('the Review circle saves as Next does', () => {
  it('a correction from 5 to 7 bags is saved, then Review opens', async () => {
    mockForm.items = [saved()];
    await mount(<DispatchItemsStep mode="create" />);
    await correct(mockForm.items[0]);
    expect(bags()).toHaveDisplayValue('5');
    await type('7');

    await call(() => indicator().onStepPress(REVIEW));

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
    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type('4');

    await call(() => indicator().onStepPress(REVIEW));

    expect(mockForm.addFormItems).toHaveBeenCalledTimes(1);
    expect(mockForm.addFormItems).toHaveBeenCalledWith([expect.objectContaining({ grnItems_id: LOT, disp_quantity: 4 })]);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
    expect(mockForm.addFormItems.mock.invocationCallOrder[0]).toBeLessThan(mockForm.navigateToStep.mock.invocationCallOrder[0]);
  });

  it('with an empty form and no saved items it says "Add an item first" and stays', async () => {
    await mount(<DispatchItemsStep mode="create" />);

    await call(() => indicator().onStepPress(REVIEW));

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Add an item first', 'Add at least one item before you continue.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
  });

  it('with saved items and an empty form it opens Review, and saves nothing', async () => {
    mockForm.items = [saved()];
    await mount(<DispatchItemsStep mode="create" />);

    await call(() => indicator().onStepPress(REVIEW));

    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });
});

describe('every way back asks "Go back to details?" as the footer\'s Back does', () => {
  const ways: [string, (guard: MutableRefObject<(() => void) | null>) => unknown][] = [
    ['the footer\'s Back', () => pressButton('Back to dispatch details')],
    ['the Details circle', () => call(() => indicator().onStepPress(DETAILS))],
    ['a swipe to the right', () => call(() => swipe().onSwipeRight())],
    ['the Back key\'s guard', (guard) => call(() => guard.current!())],
  ];

  it.each(ways)('%s, with saved items: the question, and step 1 only after "Go back"', async (_name, leave) => {
    mockForm.items = [saved()];
    const guard: MutableRefObject<(() => void) | null> = { current: null };
    await mount(<DispatchItemsStep mode="create" backGuard={guard} />);
    hides(BACK_QUESTION);

    await leave(guard);

    shows(BACK_QUESTION);
    expect(screen.getByRole('button', { name: 'Go back' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Stay' })).toBeOnTheScreen();
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();

    // "Stay" closes the question and goes nowhere.
    await pressButton('Stay');
    hides(BACK_QUESTION);
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();

    // Asked again, "Go back" goes to step 1.
    await leave(guard);
    await pressButton('Go back');
    hides(BACK_QUESTION);
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(DETAILS);
  });

  it.each(ways)('%s, with nothing to lose: step 1 at once', async (_name, leave) => {
    const guard: MutableRefObject<(() => void) | null> = { current: null };
    await mount(<DispatchItemsStep mode="create" backGuard={guard} />);

    await leave(guard);

    hides(BACK_QUESTION);
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(DETAILS);
  });

  it('the guard follows the form: nothing saved, then a complete item typed', async () => {
    const guard: MutableRefObject<(() => void) | null> = { current: null };
    await mount(<DispatchItemsStep mode="create" backGuard={guard} />);
    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type('4');

    await call(() => guard.current!());

    shows(BACK_QUESTION);
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
  });

  it('the guard is taken away when the step is left', async () => {
    const guard: MutableRefObject<(() => void) | null> = { current: null };
    await mount(<DispatchItemsStep mode="create" backGuard={guard} />);
    expect(guard.current).toEqual(expect.any(Function));

    await screen.unmount();

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
    shows(BACK_QUESTION);
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();

    await pressButton('Go back');
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(DETAILS);
    // One listener for the route, however often the step drew itself.
    expect(back.count()).toBe(1);
  });
});

describe('Next stops on a correction that cannot be saved', () => {
  const ways: [string, () => unknown][] = [
    ['the footer\'s Next', () => pressButton('Next, review dispatch')],
    ['the Review circle', () => call(() => indicator().onStepPress(REVIEW))],
    ['a swipe to the left', () => call(() => swipe().onSwipeLeft())],
  ];

  it.each(ways)('%s, with more bags than the lot holds: the alert, the field marked, and it stays', async (_name, goOn) => {
    // 5 of this lot are in the dispatch and 5 more are in stock: 10 is the most.
    mockForm.items = [saved({ grnItems_stock: 5, original_disp_quantity: 5 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(mockForm.items[0]);
    await type('11');

    await goOn();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    // The field is marked and says why, once: the limit with its number.
    expect(quantityLabel()).toHaveStyle({ color: tokens.status.negative.text });
    shows('Enter 10 bags or fewer. That is the original stock.');
    hides('Quantity cannot exceed available stock');
    // What was typed stays in the form, still as a correction of the same line.
    expect(bags()).toHaveDisplayValue('11');
    shows('Editing item 1');
  });

  it('with the bags cleared: the alert, and the field is marked with the reason only now', async () => {
    mockForm.items = [saved()];
    await mount(<DispatchItemsStep mode="create" />);
    await correct(mockForm.items[0]);
    await type('');
    expect(quantityLabel()).not.toHaveStyle({ color: tokens.status.negative.text });
    hides('Quantity must be at least 1');

    await pressButton('Next, review dispatch');

    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(quantityLabel()).toHaveStyle({ color: tokens.status.negative.text });
    shows('Quantity must be at least 1');
  });

  // "12.5" counts as no bags, and the check of that 0 used to put "at least 1" in place of the reason shown.
  it('with "12.5" typed: the text stays in the field with the reason it was already given', async () => {
    mockForm.items = [saved()];
    await mount(<DispatchItemsStep mode="create" />);
    await correct(mockForm.items[0]);
    await type('12.5');
    shows('Quantity must be a whole number');

    await pressButton('Next, review dispatch');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(bags()).toHaveDisplayValue('12.5');
    expect(quantityLabel()).toHaveStyle({ color: tokens.status.negative.text });
    shows('Quantity must be a whole number');
    hides('Quantity must be at least 1');
  });

  it('a corrected number of bags within the limit goes on after the stop', async () => {
    mockForm.items = [saved({ grnItems_stock: 5, original_disp_quantity: 5 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(mockForm.items[0]);
    await type('11');
    await pressButton('Next, review dispatch');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();

    await type('10');
    await pressButton('Next, review dispatch');

    expect(mockForm.updateFormItem).toHaveBeenCalledWith('line-1', expect.objectContaining({ disp_quantity: 10 }));
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
  });

  it('a new item that is only part filled is left as it was: Review opens with the saved items', async () => {
    mockForm.items = [saved({ grnItems_id: OTHER_LOT })];
    await mount(<DispatchItemsStep mode="create" />);
    // A GRN and its lot are chosen, the bags are not typed yet.
    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));
    shows('Adding item 2');

    await pressButton('Next, review dispatch');

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
  const stopEditing = () => screen.queryAllByRole('button', { name: 'Stop editing this item' });
  const DISCARD_QUESTION = 'Discard changes to this item?';
  const next = () => pressButton('Next, review dispatch');

  /** The step of a dispatch with one saved line: 5 bags of a lot that has 95 more in stock. */
  const withSavedLine = async (isCreateMode: boolean) => {
    mockForm.items = [saved()];
    mockForm.isCreateMode = isCreateMode;
    await mount(<DispatchItemsStep mode={isCreateMode ? 'create' : 'edit'} />);
  };
  /** That line opened in the form. */
  const correcting = async (isCreateMode: boolean) => {
    await withSavedLine(isCreateMode);
    await correct(mockForm.items[0]);
  };
  /** The form as it is for a new, second item: nothing chosen, nothing typed, nothing marked. */
  const expectNewItemForm = () => {
    expect(stopEditing()).toHaveLength(0);
    shows('Adding item 2');
    hides('Editing item 1');
    shows('Choose GRN');
    expect(bags()).toHaveDisplayValue('');
    expect(bags()).toHaveProp('editable', false);
    expect(quantityLabel()).not.toHaveStyle({ color: tokens.status.negative.text });
    hides(/^Quantity must/);
    hides(/^Enter /);
  };

  it.each([
    ['a new dispatch', true],
    ['an edited dispatch', false],
  ])('%s: the strip names the item being corrected and offers "Stop editing this item"', async (_name, isCreateMode) => {
    await withSavedLine(isCreateMode);
    // Not while the form holds a new item.
    expect(stopEditing()).toHaveLength(0);

    await correct(mockForm.items[0]);

    expect(stopEditing()).toHaveLength(1);
    shows('Editing item 1');
    shows('Editing item');
    shows('Example Potatoes (GRN G0311)');
  });

  it.each([
    // A line of a new dispatch holds no bags yet: its limit is the stock still available.
    ['more bags than the lot holds', '96', 'Enter 95 bags or fewer. That is the available stock.'],
    ['the bags cleared', '', 'Quantity must be at least 1'],
    ['bags that are not a whole number', '12.5', 'Quantity must be a whole number'],
  ])('a new dispatch, %s: Next stops, the correction is given up, and Next opens Review', async (_what, typed, reason) => {
    await correcting(true);
    await type(typed);

    await next();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    shows(reason);
    expect(bags()).toHaveDisplayValue(typed);

    // The way out: it asks first, because the number of bags was changed.
    hides(DISCARD_QUESTION);
    await pressButton('Stop editing this item');
    shows(DISCARD_QUESTION);
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeOnTheScreen();
    expect(bags()).toHaveDisplayValue(typed);
    await pressButton('Discard changes');

    hides(DISCARD_QUESTION);
    expectNewItemForm();
    // The saved line was not written to: it still holds its 5 bags.
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.removeFormItem).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    expect(mockForm.items).toEqual([saved()]);

    await next();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW);
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
  });

  it('a new dispatch: "Keep editing" leaves the correction in the form as typed', async () => {
    await correcting(true);
    await type('96');
    await pressButton('Stop editing this item');

    await pressButton('Keep editing');

    hides(DISCARD_QUESTION);
    expect(stopEditing()).toHaveLength(1);
    shows('Editing item 1');
    expect(bags()).toHaveDisplayValue('96');
  });

  it('a new dispatch: a correction with nothing changed is given up without a question', async () => {
    await correcting(true);
    expect(bags()).toHaveDisplayValue('5');

    await pressButton('Stop editing this item');

    hides(DISCARD_QUESTION);
    expectNewItemForm();
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
  });
});

describe('the bottom bar is the shared WizardBottomBar (R1-08)', () => {
  /** The bar is the nearest ancestor that holds both buttons. */
  const bar = () => {
    let node: ReturnType<typeof screen.getByRole> = screen.getByRole('button', { name: 'Next, review dispatch' }).parent!;
    while (!within(node).queryByRole('button', { name: 'Back to dispatch details' })) node = node.parent!;
    return node;
  };
  const setOS = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);
  afterEach(() => { mockInsetBottom = 0; });

  it('Android: pads by space.md only, with a 34 dp navigation bar inset (the root stack already pads the screen)', async () => {
    setOS('android');
    mockInsetBottom = 34;
    await mount(<DispatchItemsStep mode="create" />);
    // The old bar here added the inset again: 34 + space.md.
    expect(bar()).toHaveStyle({ paddingBottom: space.md });
  });

  it('iOS: adds the inset to space.md', async () => {
    setOS('ios');
    mockInsetBottom = 34;
    await mount(<DispatchItemsStep mode="create" />);
    expect(bar()).toHaveStyle({ paddingBottom: 34 + space.md });
  });

  it('keeps its spoken labels, and shows "Add item" and "Review" (Back is an icon)', async () => {
    await mount(<DispatchItemsStep mode="create" />);
    shows('Add item');
    shows('Review');
    hides('Next');
    expect(screen.getByRole('button', { name: 'Back to dispatch details' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next, review dispatch' })).toBeOnTheScreen();
  });

  it('keeps Add item and the check mark pressable with an empty line (owner decision D7)', async () => {
    await mount(<DispatchItemsStep mode="create" />);
    expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save item' })).toBeEnabled();
  });
});

// Review 2026-10-20 (M3): a new line the person filled in (a lot and bags) that cannot be saved is not dropped on the way
// to Review. A line with no bags typed is still left behind (pinned above).
describe('Next with a new line that cannot be saved', () => {
  const next = () => pressButton('Next, review dispatch');

  it('more bags than the stock: the alert, the field marked, and it stays', async () => {
    mockForm.items = [saved({ grnItems_id: OTHER_LOT })];
    await mount(<DispatchItemsStep mode="create" />);
    // The GRN's first lot with stock is chosen: 95 bags in it. 120 is more.
    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type('120');

    await next();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    expect(mockForm.addFormItems).not.toHaveBeenCalled();
    expect(quantityLabel()).toHaveStyle({ color: tokens.status.negative.text });
    shows('Enter 95 bags or fewer. That is the available stock.');
    // What was typed stays in the form.
    expect(bags()).toHaveDisplayValue('120');
  });

  it('with nothing saved yet the check of the line comes first, not "Add an item first" (review 2026-10-20, M3)', async () => {
    await mount(<DispatchItemsStep mode="create" />);
    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type('120');

    await next();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
    shows('Enter 95 bags or fewer. That is the available stock.');
  });

  it('after the number is brought within the stock, Next saves the line and goes on', async () => {
    mockForm.items = [saved({ grnItems_id: OTHER_LOT })];
    await mount(<DispatchItemsStep mode="create" />);
    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));
    await type('120');
    await next();
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();

    await type('90');
    await next();

    expect(mockForm.addFormItems).toHaveBeenCalledWith([expect.objectContaining({ grnItems_id: LOT, disp_quantity: 90 })]);
    // The step waits two animation frames after saving the line before it moves on.
    await waitFor(() => expect(mockForm.navigateToStep).toHaveBeenCalledWith(REVIEW));
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
    await correct(mockForm.items[0]);
  };
  const chooseOtherGrn = () => call(() => mockProps.grn!.onSelect({ id: GRN_B, gr_no: 'G0400' }));
  const chooseLot = (lot: ReturnType<typeof lotOf>) => call(() => mockProps.lot!.onSelect(lot));
  const chooseItem = () => call(() => mockProps.item!.onSelect({ item_id: ITEM, item_name: 'Example Potatoes' }));

  it('another GRN clears the line\'s item, lot and bags, so the old lot cannot be saved under the new GRN', async () => {
    await openLine();
    shows('G0311');
    expect(bags()).toHaveDisplayValue('5');

    await chooseOtherGrn();

    shows('G0400');
    shows('Choose item');
    shows('Choose lot');
    hides('GRN qty 100 · 5 in stock');
    expect(bags()).toHaveDisplayValue('');

    // Next does not save the line as it is: the lot of the old GRN would be saved under the new one.
    await pressButton('Next, review dispatch');
    expect(showAlert).toHaveBeenCalledWith('Check the item', 'Fix the fields marked in red, then try again.');
    expect(mockForm.updateFormItem).not.toHaveBeenCalled();
    expect(mockForm.navigateToStep).not.toHaveBeenCalled();
  });

  it('the item and lot of the new GRN are what is saved', async () => {
    await openLine();
    await chooseOtherGrn();
    await chooseItem();
    await chooseLot(lotB);
    await type('12');

    await pressButton('Next, review dispatch');

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

    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));

    shows('GRN qty 100 · 5 in stock');
    expect(bags()).toHaveDisplayValue('5');
  });

  it('another lot has none of the bags the line holds: its limit is its own stock', async () => {
    await openLine();
    await chooseLot(lotOf(OTHER_LOT, 10));

    // 12 is within 10 + 5 (the saved lot's 5 do not belong to this lot) but over the 10 this lot holds.
    await type('12');
    shows('Enter 10 bags or fewer. That is the available stock.');
    expect(quantityLabel()).toHaveStyle({ color: tokens.status.negative.text });

    await type('10');
    hides('Enter 10 bags or fewer. That is the available stock.');
    expect(quantityLabel()).not.toHaveStyle({ color: tokens.status.negative.text });
  });

  it('choosing the saved lot again gives the line its bags back', async () => {
    await openLine();
    await chooseLot(lotOf(OTHER_LOT, 10));
    await chooseLot(lotOf(LOT, 5));

    await type('11');
    shows('Enter 10 bags or fewer. That is the original stock.');
    await type('10');
    hides('Enter 10 bags or fewer. That is the original stock.');
  });

  // The bags are those the dispatch held when it was read, per lot: not what a line says after it was moved (A11).
  it('a line moved to another lot and back finds the bags the dispatch held on the first lot', async () => {
    // The dispatch held 5 bags on LOT. In this form the line sits on OTHER_LOT (moved there and saved), so it carries
    // none of them itself.
    mockForm.items = [saved({ grnItems_id: OTHER_LOT, grnItems_stock: 40, original_disp_quantity: 0 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(mockForm.items[0]);

    await chooseLot(lotOf(LOT, 5));

    // 5 in stock and the 5 the dispatch held on this lot: 10 is the most (it was 5 when the held bags followed the line).
    await type('11');
    shows('Enter 10 bags or fewer. That is the original stock.');
    await type('10');
    hides('Enter 10 bags or fewer. That is the original stock.');
    expect(quantityLabel()).not.toHaveStyle({ color: tokens.status.negative.text });
  });

  it('a new line on a lot the dispatch held (its own line was removed) may take those bags too', async () => {
    mockForm.items = [];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));
    await chooseItem();
    await chooseLot(lotOf(LOT, 5));

    await type('11');
    shows('Enter 10 bags or fewer. That is the original stock.');
    await type('10');
    expect(quantityLabel()).not.toHaveStyle({ color: tokens.status.negative.text });
  });

  it('a lot the dispatch did not hold has only its own stock, in an edit as in a new dispatch', async () => {
    mockForm.items = [];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await call(() => mockProps.grn!.onSelect({ id: GRN, gr_no: 'G0311' }));
    await chooseItem();
    await chooseLot(lotOf(OTHER_LOT, 10));

    await type('11');
    shows('Enter 10 bags or fewer. That is the available stock.');
  });
});

// WH-264: the X of an edited dispatch asks to discard when the saved form was changed or when the item form on screen
// holds a change that is not saved to the form yet; with neither, it asks nothing.
describe('the X of an edited dispatch on the items step', () => {
  const asksBeforeX = () => indicator().backOnFirstStep.hasData;
  beforeEach(() => {
    mockForm.items = [saved({ grnItems_stock: 5, original_disp_quantity: 5 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
  });

  it('asks when the saved form is unchanged but the bags of the line on screen were changed', async () => {
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(mockForm.items[0]);
    await type('7');

    expect(asksBeforeX()).toBe(true);
  });

  it('asks nothing when the saved form is unchanged and the line on screen is as saved', async () => {
    await mount(<DispatchItemsStep mode="edit" />);
    expect(asksBeforeX()).toBe(false);

    await correct(mockForm.items[0]);
    expect(asksBeforeX()).toBe(false);
  });

  it('asks when the saved form was changed, whatever is on screen', async () => {
    mockForm.isChanged = true;
    await mount(<DispatchItemsStep mode="edit" />);

    expect(asksBeforeX()).toBe(true);
  });
});

// WH-264, the lot as well as the bags: the X of an edited dispatch asks while the form on screen holds a change to a
// saved line (its lot or its bags) or a new line with anything in it, and asks nothing once the line was confirmed.
describe('the X of an edited dispatch, the line on screen', () => {
  const lotOf = (id: string, stock: number) => ({ id, item_id: ITEM, item_name: 'Example Potatoes', quantity: 100, stock, package_mark: 'M1', rack: 'R1', weight: 50 });
  const asksBeforeX = () => indicator().backOnFirstStep.hasData;
  const stopEditing = () => screen.queryAllByRole('button', { name: 'Stop editing this item' });
  const discardQuestionShown = () => screen.queryByText('Discard changes to this item?') !== null;
  const openSavedLine = async () => {
    mockForm.items = [saved({ grnItems_stock: 5, original_disp_quantity: 5 })];
    mockForm.heldBags = { [LOT]: 5 };
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    await correct(mockForm.items[0]);
  };

  it('another lot of the same item with the bags kept: the X asks, and so does "Stop editing this item"', async () => {
    await openSavedLine();
    expect(asksBeforeX()).toBe(false);

    await call(() => mockProps.lot!.onSelect(lotOf(OTHER_LOT, 40)));
    expect(bags()).toHaveDisplayValue('5');

    expect(asksBeforeX()).toBe(true);
    await pressButton('Stop editing this item');
    expect(discardQuestionShown()).toBe(true);
  });

  it('the saved line untouched: the X asks nothing, and "Stop editing this item" gives it up with no question', async () => {
    await openSavedLine();

    expect(asksBeforeX()).toBe(false);
    await pressButton('Stop editing this item');
    expect(discardQuestionShown()).toBe(false);
    expect(stopEditing()).toHaveLength(0);
  });

  it('a new line with something in it: the X asks', async () => {
    mockForm.isCreateMode = false;
    await mount(<DispatchItemsStep mode="edit" />);
    expect(asksBeforeX()).toBe(false);

    await call(() => mockProps.lot!.onSelect(lotOf(OTHER_LOT, 40)));

    expect(asksBeforeX()).toBe(true);
  });

  it('a line confirmed with the check mark is not asked about: the X goes back to what the saved form says', async () => {
    await openSavedLine();
    await type('7');
    expect(asksBeforeX()).toBe(true);

    await userEvent.setup({ delay: 0 }).press(screen.getByTestId('dispatch-items-add'));

    expect(mockForm.updateFormItem).toHaveBeenCalledTimes(1);
    expect(asksBeforeX()).toBe(false);
  });
});
