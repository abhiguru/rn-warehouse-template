/**
 * The step header while a save runs (owner rule D22, with the GRN review step): `disabled` makes the X and the step
 * circles do nothing; with a `leaveWarning` as well the X still works and asks with that warning (the save's answer
 * is not known yet, so leaving may lose track of a GRN that was saved), and the circles stay disabled.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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

const WARNING = 'It may have been saved. Check the list before entering it again.';

function render(props: { disabled?: boolean; leaveWarning?: string }, handlers = { onCancel: jest.fn(), onStepPress: jest.fn() }) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
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
  });
  return { tree, ...handlers };
}
const close = (tree: ReactTestRenderer) =>
  tree.root.find((node) => node.props.accessibilityLabel === 'Cancel GRN' && typeof node.props.onPress === 'function');
const circles = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.hitSlop === 'object' && 'onPress' in node.props);
const lastQuestion = () => jest.mocked(showAlert).mock.calls.at(-1)!;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('the step header', () => {
  it('asks "Discard this GRN?" with the form\'s message when nothing is running', () => {
    const { tree } = render({});
    act(() => close(tree).props.onPress());
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(lastQuestion()[1]).toBe('2 items and the GRN details will be lost.');
    expect(close(tree).props.accessibilityState).toBeUndefined();
    act(() => tree.unmount());
  });

  it('while a save runs the X and the step circles do nothing, and the X is reported disabled', () => {
    const { tree, onStepPress, onCancel } = render({ disabled: true });

    expect(close(tree).props.accessibilityState).toEqual({ disabled: true });
    act(() => close(tree).props.onPress());
    act(() => circles(tree)[0].props.onPress());
    act(() => { jest.runAllTimers(); });

    expect(showAlert).not.toHaveBeenCalled();
    expect(onStepPress).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('with a leave warning the X still asks, with that warning, and Leave anyway leaves; the circles stay disabled', () => {
    const { tree, onStepPress, onCancel } = render({ disabled: true, leaveWarning: WARNING });

    expect(close(tree).props.accessibilityState).toBeUndefined();
    act(() => close(tree).props.onPress());
    expect(showAlert).toHaveBeenCalledTimes(1);
    const [, message, buttons] = lastQuestion();
    expect(message).toBe(WARNING);
    // Nothing is being edited: the app waits for the server, so the buttons say that ("Leave anyway" leaves).
    expect(buttons!.map((button) => button.text)).toEqual(['Keep waiting', 'Leave anyway']);
    act(() => buttons![1].onPress!());
    expect(onCancel).toHaveBeenCalledTimes(1);

    act(() => circles(tree)[0].props.onPress());
    act(() => { jest.runAllTimers(); });
    expect(onStepPress).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('a leave warning without a running save changes nothing: the X asks its own question', () => {
    const { tree } = render({ leaveWarning: WARNING });
    act(() => close(tree).props.onPress());
    expect(lastQuestion()[1]).toBe('2 items and the GRN details will be lost.');
    act(() => tree.unmount());
  });
});
