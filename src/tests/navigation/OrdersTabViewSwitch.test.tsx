import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';

let mockCanManageOrders = true;
let mockListThrows = false;
jest.mock('@/hooks/useRoleBasedAccess', () => ({
  useRoleBasedAccess: () => ({ canManageOrders: mockCanManageOrders }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: null } }),
}));
jest.mock('@/hooks/useHaptics', () => ({ triggerSelection: jest.fn() }));
// The server-alert banner (an administrator of a local-only facility) refreshes on focus; there is no navigator here.
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useFocusEffect: require('../components/focusHarness').useFocusEffect,
}));
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

// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
const here = (testID: string) => expect(screen.getByTestId(testID)).toBeOnTheScreen();
const gone = (testID: string) => expect(screen.queryAllByTestId(testID, everything)).toHaveLength(0);
const segment = (label: string) => screen.getByLabelText(label);

describe('Orders tab view switch', () => {
  afterEach(() => {
    mockCanManageOrders = true;
  });

  it('lets warehouse roles switch between Orders and Queue, keeping the switch in both', async () => {
    const user = userEvent.setup({ delay: 0 });
    await render(<OrdersTab />);
    here('orders-list');
    gone('queue-list');

    await user.press(segment('Queue'));
    here('queue-list');
    gone('orders-list');

    await user.press(segment('Orders'));
    here('orders-list');
  });

  it('shows customers the orders list with no switch', async () => {
    mockCanManageOrders = false;
    await render(<OrdersTab />);
    here('orders-list');
    expect(screen.queryAllByLabelText('Queue', everything)).toHaveLength(0);
  });
});

// The tab's lists sit in ListErrorBoundary like GRN and Dispatch (owner, 2026-10-17). The view switch stays above the
// error, and switching view clears it.
describe('Orders tab crash guard', () => {
  afterEach(() => {
    mockListThrows = false;
    jest.restoreAllMocks();
  });

  it('shows "Couldn\'t show the orders" under a working switch, and switching back draws the list again', async () => {
    const user = userEvent.setup({ delay: 0 });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListThrows = true;
    await render(<OrdersTab />);
    gone('orders-list');
    expect(screen.getAllByText("Couldn't show the orders. Try again.")[0]).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Try loading the orders again')[0]).toBeOnTheScreen();

    await user.press(segment('Queue'));
    here('queue-list');
    expect(screen.queryAllByText("Couldn't show the orders. Try again.", everything)).toHaveLength(0);

    mockListThrows = false;
    await user.press(segment('Orders'));
    here('orders-list');
  });
});
