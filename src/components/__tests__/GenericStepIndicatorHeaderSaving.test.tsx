/**
 * The step header while a save runs (owner rule D22, with the GRN review step): `disabled` makes the X and the step
 * circles do nothing; with a `leaveWarning` as well the X still works and asks with that warning (the save's answer
 * is not known yet, so leaving may lose track of a GRN that was saved), and the circles stay disabled.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { showAlert } from '@/utils/alert';
import { GenericStepIndicatorHeader } from '../GenericStepIndicatorHeader';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/hooks/useFirstStepBack', () => ({ useFirstStepBack: jest.fn() }));

const WARNING = 'It may have been saved. Check the list before entering it again.';
const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });

async function renderHeader(props: { disabled?: boolean; leaveWarning?: string; backOnFirstStep?: { hasData: boolean; enabled?: boolean; exitRoute: string } }, handlers = { onCancel: jest.fn(), onStepPress: jest.fn() }) {
  await render(
    <GenericStepIndicatorHeader
      steps={[{ label: 'Details' }, { label: 'Items' }, { label: 'Review' }] as never}
      currentStep={3}
      completedSteps={[1, 2]}
      entity="grn"
      cancelMessage="2 items and the GRN details will be lost."
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}
const close = () => screen.getByRole('button', { name: 'Close new GRN' });
const circles = () => screen.getAllByRole('button', { name: /^Step \d of 3/ });
const lastQuestion = () => jest.mocked(showAlert).mock.calls.at(-1)!;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('the step header', () => {
  it('asks "Discard this GRN?" with the form\'s message when nothing is running', async () => {
    await renderHeader({});
    await user.press(close());
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(lastQuestion()[1]).toBe('2 items and the GRN details will be lost.');
    expect(close()).toBeEnabled();
    expect(close().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('while a save runs the X and the step circles do nothing, and the X is reported disabled', async () => {
    const { onStepPress, onCancel } = await renderHeader({ disabled: true });

    expect(close()).toBeDisabled();
    circles().forEach(circle => expect(circle).toBeDisabled());
    await user.press(close());
    await user.press(circles()[0]);
    await jest.runAllTimersAsync();

    expect(showAlert).not.toHaveBeenCalled();
    expect(onStepPress).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('with a leave warning the X still asks, with that warning, and Leave anyway leaves; the circles stay disabled', async () => {
    const { onStepPress, onCancel } = await renderHeader({ disabled: true, leaveWarning: WARNING });

    expect(close()).toBeEnabled();
    expect(close().props.accessibilityState).toMatchObject({ disabled: false });
    await user.press(close());
    expect(showAlert).toHaveBeenCalledTimes(1);
    const [, message, buttons] = lastQuestion();
    expect(message).toBe(WARNING);
    // Nothing is being edited: the app waits for the server, so the buttons say that ("Leave anyway" leaves).
    expect(buttons!.map((button) => button.text)).toEqual(['Keep waiting', 'Leave anyway']);
    buttons![1].onPress!();
    expect(onCancel).toHaveBeenCalledTimes(1);

    circles().forEach(circle => expect(circle).toBeDisabled());
    await user.press(circles()[0]);
    await jest.runAllTimersAsync();
    expect(onStepPress).not.toHaveBeenCalled();
  });

  it('a leave warning without a running save changes nothing: the X asks its own question', async () => {
    await renderHeader({ leaveWarning: WARNING });
    await user.press(close());
    expect(lastQuestion()[1]).toBe('2 items and the GRN details will be lost.');
  });
});

// WH-260, WH-263, WH-264: an edited form asks before the X only when something was changed since it opened.
describe('the X of an edit form', () => {
  it('leaves with no question when nothing was changed', async () => {
    const { onCancel } = await renderHeader({ backOnFirstStep: { hasData: false, enabled: false, exitRoute: '/(tabs)/grn' } });
    await user.press(close());
    expect(showAlert).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('asks once after a change, and leaves only on Discard', async () => {
    const { onCancel } = await renderHeader({ backOnFirstStep: { hasData: true, enabled: false, exitRoute: '/(tabs)/grn' } });
    await user.press(close());
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
