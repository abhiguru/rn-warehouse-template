import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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
let tree: ReactTestRenderer | undefined;
const makeStore = () => (mockStore = configureStore({ reducer: { auth: authReducer, theme: themeReducer } as never, middleware: gdm => gdm({ serializableCheck: false, immutableCheck: false }) }));
const strip = (root: ReactTestRenderer) => root.root.findAll(node => node.props.testID === 'sign-out-reason');

afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

it('shows the stored reason of a forced sign-out once, and Dismiss removes it', async () => {
  const store = makeStore();
  store.dispatch({ type: 'auth/forceLogoutOnInvalidToken/pending', meta: { requestId: 'a' } });
  store.dispatch({ type: 'auth/forceLogoutOnInvalidToken/fulfilled', meta: { requestId: 'a' }, payload: { reason: REASON } });
  await act(async () => { tree = create(<SignOutReasonStrip />); });
  expect(strip(tree!).length).toBeGreaterThan(0);
  expect(JSON.stringify(tree!.toJSON())).toContain('keys were changed');
  const dismiss = tree!.root.find(node => node.props.testID === 'sign-out-reason-dismiss' && typeof node.props.onPress === 'function');
  expect(JSON.stringify(tree!.toJSON())).toContain('Dismiss');
  await act(async () => { dismiss.props.onPress(); });
  expect(strip(tree!)).toHaveLength(0);
  expect((store.getState() as { auth: { signOutReason: string | null } }).auth.signOutReason).toBeNull();
});

it('draws nothing when no sign-out reason is stored', async () => {
  makeStore();
  await act(async () => { tree = create(<SignOutReasonStrip />); });
  expect(tree!.toJSON()).toBeNull();
});
