import React from 'react';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/slices/authSlice';
import themeReducer from '@/store/slices/themeSlice';
import { SignOutReasonStrip } from '@/components/central/SignOutReasonStrip';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// react-redux is ESM-only under Jest: the hooks read a real store through a small stand-in.
let mockStore: { getState: () => unknown; dispatch: (action: unknown) => unknown; subscribe: (l: () => void) => () => void };
jest.mock('@/store/hooks', () => {
  const ReactMock = require('react');
  return {
    useAppDispatch: () => (action: unknown) => mockStore.dispatch(action),
    useAppSelector: (selector: (state: unknown) => unknown) => {
      const [, force] = ReactMock.useReducer((n: number) => n + 1, 0);
      ReactMock.useEffect(() => mockStore.subscribe(() => force()), []);
      return selector(mockStore.getState());
    },
  };
});

const REASON = "This server's sign-in keys were changed. Please sign in again.";
const makeStore = () => (mockStore = configureStore({ reducer: { auth: authReducer, theme: themeReducer } as never, middleware: gdm => gdm({ serializableCheck: false, immutableCheck: false }) }));

it('shows the stored reason of a forced sign-out once, and Dismiss removes it', async () => {
  const store = makeStore();
  store.dispatch({ type: 'auth/forceLogoutOnInvalidToken/pending', meta: { requestId: 'a' } });
  store.dispatch({ type: 'auth/forceLogoutOnInvalidToken/fulfilled', meta: { requestId: 'a' }, payload: { reason: REASON } });
  await render(<SignOutReasonStrip />);
  expect(screen.getByTestId('sign-out-reason')).toBeOnTheScreen();
  expect(screen.getByText(/keys were changed/)).toBeOnTheScreen();
  const dismiss = screen.getByRole('button', { name: 'Dismiss' });
  expect(within(dismiss).getByText('Dismiss')).toBeOnTheScreen();
  await userEvent.press(dismiss);
  expect(screen.queryByTestId('sign-out-reason')).not.toBeOnTheScreen();
  expect((store.getState() as { auth: { signOutReason: string | null } }).auth.signOutReason).toBeNull();
});

it('draws nothing when no sign-out reason is stored', async () => {
  makeStore();
  await render(<SignOutReasonStrip />);
  expect(screen.toJSON()).toBeNull();
});
