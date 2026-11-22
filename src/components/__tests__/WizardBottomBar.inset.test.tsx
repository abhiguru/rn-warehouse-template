/**
 * WizardBottomBar (style guide §13.8, §14.3): the bottom inset is added on iOS only (the root stack already pads
 * Android screens by it), the buttons stack from font scale 1.5 with the primary one on top, and the optional
 * Back label and test ids reach the buttons.
 */
import React from 'react';
import { Dimensions, Platform } from 'react-native';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { space } from '@/theme/tokens';
import WizardBottomBar from '../WizardBottomBar';
import { keyboardEvent, recordKeyboard } from '@/tests/helpers/wizardKeyboardLift';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }),
}));

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
});

const user = userEvent.setup({ delay: 0 });

async function renderBar(os: 'ios' | 'android', fontScale: number, props: Partial<React.ComponentProps<typeof WizardBottomBar>> = {}) {
  Platform.OS = os;
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale } });
  await render(<WizardBottomBar currentStep={2} totalSteps={3} onPrevious={jest.fn()} onNext={jest.fn()} {...props} />);
}
/** The bar's own outermost view. */
const bar = () => screen.root!;
const button = (label: string) => screen.getByRole('button', { name: label });
/** The bar's own handler of a button, called past the disabled state: what the bar's guard has to hold against. */
const pressPastDisabled = async (label: string) => {
  // Testing Library shows host views only; the Pressable's own onPress is on the fiber above the button's view.
  let fiber = button(label).unstable_fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
  const onPress = fiber?.memoizedProps.onPress as () => void;
  await act(async () => { onPress(); });
};
/** The buttons in the order a screen reader and the keyboard visit them: the order of the tree. */
const order = () => screen.getAllByRole('button').map((n) => n.props.accessibilityLabel);
/** Every Text on screen, one entry each. */
const texts = () => screen.getAllByText(/./).map((n) => n.children.join(''));

describe('WizardBottomBar bottom inset', () => {
  it('pads Android by space.md only', async () => {
    await renderBar('android', 1);
    expect(bar()).toHaveStyle({ paddingBottom: space.md });
  });

  it('adds the inset on iOS', async () => {
    await renderBar('ios', 1);
    expect(bar()).toHaveStyle({ paddingBottom: 34 + space.md });
  });
});

describe('WizardBottomBar at large text', () => {
  it('keeps Back and Next side by side at font scale 1.3', async () => {
    await renderBar('android', 1.3);
    expect(bar()).toHaveStyle({ flexDirection: 'row' });
    expect(button('Next')).toHaveStyle({ flex: 1 });
  });

  it('stacks the buttons at font scale 1.5, Next on top', async () => {
    await renderBar('android', 1.5);
    expect(bar()).toHaveStyle({ flexDirection: 'column' });
    expect(button('Next')).toHaveStyle({ flex: 0, alignSelf: 'stretch' });
    expect(button('Back')).toHaveStyle({ flex: 0, alignSelf: 'stretch' });
  });
});

describe('WizardBottomBar reading and focus order', () => {
  it('is Back then Next side by side', async () => {
    await renderBar('android', 1);
    expect(order()).toEqual(['Back', 'Next']);
  });

  it('is Next then Back when the buttons stack from font scale 1.5, the order they are drawn in', async () => {
    await renderBar('android', 1.5);
    expect(order()).toEqual(['Next', 'Back']);
    await screen.unmount();
    await renderBar('ios', 2);
    expect(order()).toEqual(['Next', 'Back']);
  });

  it('speaks a given label for Next without changing what it shows', async () => {
    await renderBar('android', 1, { nextAccessibilityLabel: 'Next: review' });
    const next = button('Next: review');
    expect(within(next).getAllByText(/./).map((n) => n.children.join(''))).toEqual(['Next']);
  });
});

describe('WizardBottomBar labels and test ids', () => {
  it('uses a given Back label and test ids, and keeps "Back" otherwise', async () => {
    await renderBar('android', 1, { previousAccessibilityLabel: 'Back to dispatch details', previousTestID: 'bar-back', nextTestID: 'bar-next' });
    expect(button('Back to dispatch details').props.testID).toBe('bar-back');
    expect(button('Next').props.testID).toBe('bar-next');
    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    await screen.unmount();
    await renderBar('android', 1);
    expect(button('Back').props.testID).toBeUndefined();
  });
});

describe('WizardBottomBar with an Add item button (Items steps)', () => {
  it('is Back (icon only, still read as Back), Add item (outlined), Review (filled)', async () => {
    const onAdd = jest.fn();
    await renderBar('android', 1, { onAdd });
    expect(order()).toEqual(['Back', 'Add item', 'Review']);
    // Back has no word; the other two do.
    expect(texts()).toEqual(['Add item', 'Review']);
    expect(button('Back')).toHaveStyle({ flex: 0, width: 48 });
    await user.press(button('Add item'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('names the buttons as the screen says (Save changes, Back to ...)', async () => {
    await renderBar('android', 1, { onAdd: jest.fn(), addLabel: 'Save changes', previousAccessibilityLabel: 'Back to details' });
    expect(order()).toEqual(['Back to details', 'Save changes', 'Review']);
  });

  it('stacks Review, Add item, Back from font scale 1.5, with Back written out', async () => {
    await renderBar('android', 1.5, { onAdd: jest.fn() });
    expect(order()).toEqual(['Review', 'Add item', 'Back']);
    expect(texts()).toEqual(['Review', 'Add item', 'Back']);
  });

  it('keeps Add item pressable unless a save is running', async () => {
    const onAdd = jest.fn();
    await renderBar('android', 1, { onAdd });
    // The state exactly as the bar states it: the `disabled` key is there and false (not just missing).
    expect(button('Add item').props.accessibilityState.disabled).toBe(false);
    await screen.unmount();
    await renderBar('android', 1, { onAdd, addDisabled: true });
    await pressPastDisabled('Add item');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('without onAdd the bar is what it was', async () => {
    await renderBar('android', 1);
    expect(order()).toEqual(['Back', 'Next']);
    expect(texts()).toEqual(['Back', 'Next']);
  });
});

describe('WizardBottomBar bottom inset while the keyboard is up (WH-228)', () => {
  // The keyboard is a recorded stand-in (the test renderer has none).
  let recorder: ReturnType<typeof recordKeyboard>;
  beforeEach(() => { recorder = recordKeyboard(); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('iOS: drops the home-indicator inset while the keyboard is up and has it back after', async () => {
    await renderBar('ios', 1);
    expect(bar()).toHaveStyle({ paddingBottom: 34 + space.md });
    await act(async () => { recorder.fire('keyboardDidShow', keyboardEvent(1350)); });
    expect(bar()).toHaveStyle({ paddingBottom: space.md });
    await act(async () => { recorder.fire('keyboardDidHide'); });
    expect(bar()).toHaveStyle({ paddingBottom: 34 + space.md });
  });

  it('Android: padding is space.md before, during and after', async () => {
    await renderBar('android', 1);
    await act(async () => { recorder.fire('keyboardDidShow', keyboardEvent(1350)); });
    expect(bar()).toHaveStyle({ paddingBottom: space.md });
    await act(async () => { recorder.fire('keyboardDidHide'); });
    expect(bar()).toHaveStyle({ paddingBottom: space.md });
  });
});

describe('WizardBottomBar while busy', () => {
  // The buttons are disabled then, but their handlers are called here directly: the guards are what hold.
  it('does not call Next or Back while isLoading, past the disabled state', async () => {
    const onNext = jest.fn();
    const onPrevious = jest.fn();
    await renderBar('android', 1, { isLoading: true, loadingLabel: 'Working', onNext, onPrevious });
    await pressPastDisabled('Working');
    await pressPastDisabled('Back');
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it('calls Next and Back when it is not busy', async () => {
    const onNext = jest.fn();
    const onPrevious = jest.fn();
    await renderBar('android', 1, { onNext, onPrevious, nextLabel: 'Go' });
    await user.press(button('Go'));
    await user.press(button('Back'));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });
});
