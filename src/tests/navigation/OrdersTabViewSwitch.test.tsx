import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let mockCanManageOrders = true;
let mockListThrows = false;
jest.mock('@/hooks/useRoleBasedAccess', () => ({
  useRoleBasedAccess: () => ({ canManageOrders: mockCanManageOrders }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useHaptics', () => ({ triggerSelection: jest.fn() }));
jest.mock('@/components/lists', () => {
  const { View } = jest.requireActual('react-native');
  return {
    OrderFlashList: ({ subHeader }: { subHeader?: React.ReactNode }) => {
      if (mockListThrows) throw new Error('Fictional drawing failure');
      return <View testID="orders-list">{subHeader}</View>;
    },
    SupervisorOrderQueueList: ({ subHeader }: { subHeader?: React.ReactNode }) => (
      <View testID="queue-list">{subHeader}</View>
    ),
  };
});

import OrdersTab from '../../../app/(tabs)/index';

const has = (root: TestRenderer.ReactTestInstance, testID: string) =>
  root.findAll((node) => node.props.testID === testID).length > 0;
const segment = (root: TestRenderer.ReactTestInstance, label: string) =>
  root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];

describe('Orders tab view switch', () => {
  afterEach(() => {
    mockCanManageOrders = true;
  });

  it('lets warehouse roles switch between Orders and Queue, keeping the switch in both', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OrdersTab />);
    });
    const root = renderer.root;
    expect(has(root, 'orders-list')).toBe(true);
    expect(has(root, 'queue-list')).toBe(false);

    act(() => segment(root, 'Queue').props.onPress());
    expect(has(root, 'queue-list')).toBe(true);
    expect(has(root, 'orders-list')).toBe(false);

    act(() => segment(root, 'Orders').props.onPress());
    expect(has(root, 'orders-list')).toBe(true);
    act(() => renderer.unmount());
  });

  it('shows customers the orders list with no switch', () => {
    mockCanManageOrders = false;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OrdersTab />);
    });
    const root = renderer.root;
    expect(has(root, 'orders-list')).toBe(true);
    expect(segment(root, 'Queue')).toBeUndefined();
    act(() => renderer.unmount());
  });
});

// The tab's lists sit in ListErrorBoundary like GRN and Dispatch (owner, 2026-10-17). The view switch stays above the
// error, and switching view clears it.
describe('Orders tab crash guard', () => {
  afterEach(() => {
    mockListThrows = false;
    jest.restoreAllMocks();
  });

  it('shows "Couldn\'t show the orders" under a working switch, and switching back draws the list again', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListThrows = true;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OrdersTab />);
    });
    const root = renderer.root;
    const texts = () => root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children);
    expect(has(root, 'orders-list')).toBe(false);
    expect(texts()).toContain("Couldn't show the orders. Try again.");
    expect(root.findAll((node) => node.props.accessibilityLabel === 'Try loading the orders again').length).toBeGreaterThan(0);

    act(() => segment(root, 'Queue').props.onPress());
    expect(has(root, 'queue-list')).toBe(true);
    expect(texts()).not.toContain("Couldn't show the orders. Try again.");

    mockListThrows = false;
    act(() => segment(root, 'Orders').props.onPress());
    expect(has(root, 'orders-list')).toBe(true);
    act(() => renderer.unmount());
  });
});
