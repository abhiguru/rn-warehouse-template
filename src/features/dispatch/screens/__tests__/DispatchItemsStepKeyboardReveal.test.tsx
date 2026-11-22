/**
 * WH-228: on the dispatch items step the bags field and its "Enter N bags or fewer" line end above the lifted
 * WizardBottomBar while the keyboard is up. The real step, the real bar and the real useRevealFocusedField; the
 * keyboard, the window and the scroll view (its scroll offset moves the field) are recorded stand-ins.
 */
import React from 'react';
import { Keyboard, PixelRatio, TextInput } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { space, typography } from '@/theme/tokens';
import { expectRevealWired, recordedRevealRefs } from '@/tests/helpers/revealWiring';
import { liftOf, placeBar } from '@/tests/helpers/wizardKeyboardLift';
import { DispatchItemsStep } from '../DispatchItemsStep';

const CUSTOMER = '22222222-3333-4444-8555-666666666666';
const GRN = '11111111-2222-4333-8444-555555555555';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => {
  const form = {
    header: { disp_no: 'DD0001', customer_id: '22222222-3333-4444-8555-666666666666', customer_name: 'Example Traders' },
    items: [],
    isCreateMode: true,
    addFormItems: jest.fn(),
    updateFormItem: jest.fn(),
    removeFormItem: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
  };
  return { useDispatchForm: () => form };
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useRevealFocusedField', () => require('@/tests/helpers/revealWiring').recordRevealRefs());
const mockScrolls: number[] = [];
jest.mock('react-native-keyboard-aware-scroll-view', () => {
  const React = require('react');
  return {
    KeyboardAwareScrollView: React.forwardRef((props: { children?: unknown; onScrollBeginDrag?: () => void; onTouchStartCapture?: () => void; onTouchEndCapture?: () => void; onTouchCancelCapture?: () => void; onChangeCapture?: () => void }, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({
        scrollForExtraHeightOnAndroid: (by: number) => { mockScrolls.push(by); },
        scrollToPosition: jest.fn(),
      }));
      return React.createElement('View', {
        onScrollBeginDrag: props.onScrollBeginDrag,
        onTouchStartCapture: props.onTouchStartCapture,
        onTouchEndCapture: props.onTouchEndCapture,
        onTouchCancelCapture: props.onTouchCancelCapture,
        onChangeCapture: props.onChangeCapture,
      }, props.children);
    }),
  };
});
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: 'SwipeableFormStep' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/features/dispatch/components', () => ({
  // A stand-in that draws the way to pick the GRN and calls the step's own onSelect.
  GRNAutocompleteBottomSheet: ({ onSelect }: { onSelect: (grn: { id: string; gr_no: string }) => void }) =>
    require('react').createElement(require('react-native').Pressable, {
      accessibilityRole: 'button',
      accessibilityLabel: 'Pick GRN G0311',
      onPress: () => onSelect({ id: '11111111-2222-4333-8444-555555555555', gr_no: 'G0311' }),
    }),
  GRNItemBottomSheet: () => null,
  LotBottomSheet: () => null,
  ItemsSummaryBottomSheet: () => null,
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const KEYBOARD_TOP = 1350;
const BAR_TOP = 1250; // un-lifted bottom 2183 - lift 833 - bar height 100
const FIELD_HEIGHT = 52;
/** The field starts behind the bar, the way it does on the phone when the keyboard has just covered the lower screen. */
const FIELD_TOP_AT_REST = 1250;

let handlers: Array<(event?: unknown) => void> = [];

const NEXT = 'Next, review dispatch';
const lift = () => liftOf(NEXT);

beforeEach(async () => {
  mockScrolls.length = 0;
  handlers = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
    if (name === 'keyboardDidShow') handlers.push(handler);
    return { remove: jest.fn() };
  }) as never);
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({
    success: true,
    data: {
      grn: { id: GRN, gr_no: 'G0311', date: '2026-10-01', customer_id: CUSTOMER, customer_name: 'Example Traders' },
      items: [{ id: 'lot-1', item_id: 'potato', item_name: 'Example Potatoes', quantity: 100, stock: 40, package_mark: 'M1', rack: 'R1', weight: 50 }],
    },
  } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
  recordedRevealRefs.length = 0;
  await render(<DispatchItemsStep mode="create" />);
  await userEvent.press(screen.getByRole('button', { name: 'Pick GRN G0311' }));
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('Dispatch Items: after the bar lifts, the field and its "Enter 40 bags or fewer" line end above the bar', async () => {
  await fireEvent.changeText(screen.getByLabelText('Bags to dispatch'), '100');
  expect(screen.getByText(/^Enter 40 bags or fewer/)).toBeOnTheScreen();

  // The bar is measured un-lifted-bottom 2183 minus its lift; the field sits where the scroll offset puts it.
  let offset = 0;
  placeBar(2183, NEXT);
  jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, FIELD_TOP_AT_REST - offset, 900, FIELD_HEIGHT),
  } as never);

  await act(async () => { handlers.forEach((h) => h({ endCoordinates: { screenY: KEYBOARD_TOP, height: 800 } })); });

  expect(lift()).toBe(833);
  expect(mockScrolls).toHaveLength(1);
  offset += mockScrolls[0];
  const fieldBottom = FIELD_TOP_AT_REST - offset + FIELD_HEIGHT;
  const hintBottom = fieldBottom + space.xs + typography.footnote.lineHeight;
  expect(hintBottom).toBeLessThanOrEqual(BAR_TOP);
  // And no more than needed: the line plus space.sm is flush with the bar's top, to the rounding up.
  expect(BAR_TOP - (hintBottom + space.sm)).toBeLessThan(1);
});

it('Dispatch Items: a field already above the bar is not scrolled', async () => {
  await fireEvent.changeText(screen.getByLabelText('Bags to dispatch'), '100');
  placeBar(2183, NEXT);
  jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 800, 900, FIELD_HEIGHT),
  } as never);
  await act(async () => { handlers.forEach((h) => h({ endCoordinates: { screenY: KEYBOARD_TOP, height: 800 } })); });
  expect(mockScrolls).toHaveLength(0);
});

it('Dispatch Items: notes a drag on its scroll view (useRevealScrollRef), so a moved bar does not scroll back', () => {
  const scrolls = screen.root!.queryAll((n) => n.type === 'View' && typeof n.props.onScrollBeginDrag === 'function', { includeSelf: true });
  expect(scrolls).toHaveLength(1);
  // WH-243: the scroll view carries the step's own reveal handlers (a dropped spread fails here)
  expect(recordedRevealRefs).toHaveLength(1);
  expectRevealWired(scrolls[0], recordedRevealRefs[0]);
});
