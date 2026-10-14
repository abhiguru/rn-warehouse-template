/**
 * The iOS swipe from the left edge on the GRN and Dispatch wizards.
 *
 * The swipe takes the top step off its stack without going the step's own way
 * back, so the Items step would be left without its question ("Save this
 * item?" on a GRN, "Go back to details?" on a dispatch). The two Dispatch
 * stacks turned the swipe off for all their steps; the two GRN stacks did not.
 * Back in the footer, the step circles and the X in the step header are the
 * ways back.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import GRNFormLayout from '../../../app/grn-form/_layout';
import GRNEditLayout from '../../../app/grn-edit/[id]/_layout';
import DispatchFormLayout from '../../../app/dispatch-form/_layout';
import DispatchEditLayout from '../../../app/dispatch-edit/[id]/_layout';

type ScreenProps = { name: string; options?: Record<string, unknown> };
type StackProps = { screenOptions?: Record<string, unknown>; children?: React.ReactNode };

// The stack is a stand-in that keeps its props: what a wizard asks of its stack is what is tested.
const mockStack = jest.fn((_props: StackProps) => null);
jest.mock('expo-router', () => {
  const Stack = (props: StackProps) => mockStack(props);
  Stack.Screen = (_props: ScreenProps) => null;
  return {
    Stack,
    router: { replace: jest.fn() },
    useNavigation: () => ({ getParent: () => ({ setOptions: jest.fn() }) }),
  };
});
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
jest.mock('@/store/hooks', () => ({ useAppDispatch: () => jest.fn() }));

let tree: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  // The new-GRN stack draws its steps one frame after it has reset the form.
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((run: FrameRequestCallback) => { run(0); return 0; });
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

describe.each([
  ['a new GRN', GRNFormLayout],
  ['an edited GRN', GRNEditLayout],
  ['a new dispatch', DispatchFormLayout],
  ['an edited dispatch', DispatchEditLayout],
])('the stack of %s', (_name, Layout) => {
  it('turns the edge swipe off for all its steps, and no step turns it on again', async () => {
    await act(async () => { tree = create(<Layout />); });

    expect(mockStack).toHaveBeenCalled();
    const { screenOptions, children } = mockStack.mock.calls.at(-1)![0];
    expect(screenOptions).toMatchObject({ headerShown: false, gestureEnabled: false });
    const steps = React.Children.toArray(children) as React.ReactElement<ScreenProps>[];
    expect(steps.filter((step) => step.props.options && 'gestureEnabled' in step.props.options)).toEqual([]);
  });
});
