import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import TabsLayout from '../../../app/(tabs)/_layout';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { initializeAuth } from '@/store/slices/authSlice';
import { loadAuthSlice } from '@/store/loadAuthSlice';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

jest.mock('react-native', () => {
  const React = require('react');
  const View = (props: Record<string, unknown>) =>
    React.createElement('react-native-view', props);

  return {
    View,
    ActivityIndicator: (props: Record<string, unknown>) =>
      React.createElement(View, {
        ...props,
        testID: 'auth-restore-spinner',
      }),
    ImageBackground: ({
      children,
      style,
    }: {
      children?: React.ReactNode;
      style?: Record<string, unknown>;
    }) =>
      React.createElement(
        View,
        { style, testID: 'tabs-background' },
        children
      ),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    SafeAreaView: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
    }) => React.createElement(View, { ...props, testID: 'tabs-safe-area' }, children),
  };
});

jest.mock('expo-status-bar', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    StatusBar: (props: Record<string, unknown>) =>
      React.createElement(View, { ...props, testID: 'tabs-status-bar' }),
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');

  const Tabs = ({
    children,
    screenOptions,
    tabBar,
  }: {
    children?: React.ReactNode;
    screenOptions?: unknown;
    tabBar?: (props: Record<string, unknown>) => React.ReactNode;
  }) => {
    const tabbar = tabBar?.({ screenOptions });
    return React.createElement(
      View,
      { testID: 'protected-tabs' },
      children,
      React.createElement(View, { testID: 'tabs-custom-tab-bar' }, tabbar)
    );
  };

  Tabs.Screen = ({
    name,
  }: {
    name: string;
  }) => React.createElement(View, { testID: `tab-screen-${name}` });

  return { Tabs, useRouter: jest.fn() };
});

jest.mock('@/store/hooks', () => ({
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));

jest.mock('@/store/slices/authSlice', () => ({
  initializeAuth: jest.fn(() => ({ __initializeAuthThunk: true })),
}));

jest.mock('@/store/loadAuthSlice', () => ({
  loadAuthSlice: jest.fn(),
}));

jest.mock('@/components/FioriTabBar', () => {
  const React = require('react');
  const { View } = require('react-native');

  return (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, testID: 'fiori-tab-bar' });
});

jest.mock('@/hooks/useTheme', () => ({
  useTheme: jest.fn(),
}));

type AuthSnapshot = {
  userProfile: unknown;
  session: unknown;
  user: unknown;
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
};

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

const createDeferred = (): Deferred => {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const findTestId = (
  root: ReactTestInstance,
  testID: string
): ReactTestInstance | undefined =>
  root.findAll((node) => node.props.testID === testID)[0];

const hasTestId = (root: ReactTestInstance, testID: string): boolean =>
  Boolean(findTestId(root, testID));

const getTestId = (
  root: ReactTestInstance,
  testID: string
): ReactTestInstance => {
  const node = findTestId(root, testID);
  expect(node).toBeDefined();
  return node as ReactTestInstance;
};

const renderLayout = async (): Promise<ReactTestRenderer> => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<TabsLayout />);
    await flushPromises();
  });
  return renderer;
};

const unmountLayout = async (renderer: ReactTestRenderer): Promise<void> => {
  await act(async () => {
    renderer.unmount();
  });
};

const settleRestore = async (
  deferred: Deferred,
  outcome: 'fulfilled' | 'rejected' = 'fulfilled'
): Promise<void> => {
  await act(async () => {
    if (outcome === 'fulfilled') {
      deferred.resolve();
    } else {
      deferred.reject(new Error('restore rejected'));
    }
    await flushPromises();
  });
};

describe('TabsLayout authentication gate', () => {
  let authState: AuthSnapshot;
  let restore: Deferred;
  let replace: jest.Mock;
  let dispatch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    authState = { userProfile: null, session: null, user: null };
    restore = createDeferred();
    replace = jest.fn();
    dispatch = jest.fn(() => {
      // Attach the production chain's rejection handler from the test side
      // before the deferred promise can be rejected.
      restore.promise.catch(() => undefined);
      return Object.assign(restore.promise, {
        unwrap: jest.fn(() => restore.promise),
      });
    });
    initializeAuth.mockImplementation(() => ({
      __initializeAuthThunk: true,
    }));
    (loadAuthSlice as jest.Mock).mockResolvedValue({ initializeAuth });
    (useAppDispatch as jest.Mock).mockReturnValue(dispatch);
    (useAppSelector as jest.Mock).mockImplementation(
      (selector: (state: { auth: AuthSnapshot }) => unknown) =>
      selector({ auth: authState })
    );
    (useRouter as jest.Mock).mockReturnValue({ replace });
    (useTheme as jest.Mock).mockReturnValue({
      colors: { primary: '#0072ce' },
      isDarkMode: false,
    });
  });

  it('keeps the protected tabs and login redirect hidden while auth restoration is pending', async () => {
    const renderer = await renderLayout();
    const root = renderer.root;

    expect(loadAuthSlice).toHaveBeenCalledTimes(1);
    expect(initializeAuth).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ __initializeAuthThunk: true });
    expect(hasTestId(root, 'auth-restore-spinner')).toBe(true);
    expect(hasTestId(root, 'protected-tabs')).toBe(false);
    expect(hasTestId(root, 'tabs-background')).toBe(false);
    expect(replace).not.toHaveBeenCalled();

    await unmountLayout(renderer);
  });

  it('shows the configured pending indicator while auth restoration is pending', async () => {
    const renderer = await renderLayout();
    const spinner = getTestId(renderer.root, 'auth-restore-spinner');

    expect(spinner.props.size).toBe('large');
    expect(spinner.props.color).toBe('#0072ce');

    await unmountLayout(renderer);
  });

  it('renders every protected tab after a custom profile restores without Supabase credentials', async () => {
    const renderer = await renderLayout();

    authState.userProfile = {
      id: 'profile-1',
      role: 'customer',
    };
    await settleRestore(restore);

    const root = renderer.root;
    expect(hasTestId(root, 'auth-restore-spinner')).toBe(false);
    expect(hasTestId(root, 'protected-tabs')).toBe(true);
    expect(hasTestId(root, 'tabs-custom-tab-bar')).toBe(true);
    expect(hasTestId(root, 'fiori-tab-bar')).toBe(true);

    const expectedScreens = [
      'index',
      'order-queue',
      'grn',
      'dispatch',
      'invoices',
      'reports',
    ];
    expect(
      expectedScreens.map(
        (name) => hasTestId(root, `tab-screen-${name}`)
      )
    ).toEqual(expectedScreens.map(() => true));

    expect(replace).not.toHaveBeenCalled();
    await unmountLayout(renderer);
  });

  it('renders protected tabs when a Supabase user and session are present', async () => {
    const renderer = await renderLayout();

    authState.user = { id: 'supabase-user' };
    authState.session = { access_token: 'session-token' };
    await settleRestore(restore);

    expect(hasTestId(renderer.root, 'protected-tabs')).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    await unmountLayout(renderer);
  });

  it('redirects once restoration settles with neither a profile nor credentials', async () => {
    const renderer = await renderLayout();

    expect(hasTestId(renderer.root, 'protected-tabs')).toBe(false);
    await settleRestore(restore);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(hasTestId(renderer.root, 'protected-tabs')).toBe(false);
    expect(hasTestId(renderer.root, 'auth-restore-spinner')).toBe(true);
    await unmountLayout(renderer);
  });

  it('redirects when restoration rejects and no credentials remain', async () => {
    const renderer = await renderLayout();

    await settleRestore(restore, 'rejected');

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(hasTestId(renderer.root, 'protected-tabs')).toBe(false);
    await unmountLayout(renderer);
  });

  it.each([
    { description: 'only a Supabase user exists', user: { id: 'user' }, session: null },
    { description: 'only a Supabase session exists', user: null, session: { access_token: 'token' } },
    { description: 'the auth fields are undefined', user: undefined, session: undefined },
  ])('redirects when $description', async ({ user, session }) => {
    const renderer = await renderLayout();

    authState.user = user;
    authState.session = session;
    await settleRestore(restore);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(hasTestId(renderer.root, 'protected-tabs')).toBe(false);
    await unmountLayout(renderer);
  });

  it('does not navigate or update after unmounting before restoration resolves', async () => {
    const renderer = await renderLayout();

    await unmountLayout(renderer);
    await settleRestore(restore);

    expect(replace).not.toHaveBeenCalled();
  });

  it('does not navigate a second time when restoration stays authenticated', async () => {
    const renderer = await renderLayout();

    authState.userProfile = { id: 'profile-1', role: 'customer' };
    await settleRestore(restore);

    // Re-rendering the same authenticated snapshot must remain stable.
    await act(async () => {
      await flushPromises();
    });

    expect(replace).not.toHaveBeenCalled();
    expect(hasTestId(renderer.root, 'protected-tabs')).toBe(true);
    await unmountLayout(renderer);
  });

  it('passes the Fiori tab bar to the protected Tabs component', async () => {
    const renderer = await renderLayout();

    authState.userProfile = { id: 'profile-1', role: 'customer' };
    await settleRestore(restore);

    const tabBarController = getTestId(renderer.root, 'tabs-custom-tab-bar');
    const tabBar = getTestId(renderer.root, 'fiori-tab-bar');

    expect(tabBar.props.screenOptions).toEqual({
      headerShown: false,
      sceneStyle: { backgroundColor: '#f7f9fa' },
    });
    await unmountLayout(renderer);
  });

  it('applies dark theme output when restored', async () => {
    const renderer = await renderLayout();

    (useTheme as jest.Mock).mockReturnValue({
      colors: { primary: '#4aa3ff' },
      isDarkMode: true,
    });
    authState.userProfile = { id: 'profile-1', role: 'customer' };
    await settleRestore(restore);

    expect(getTestId(renderer.root, 'tabs-status-bar').props).toMatchObject({
      style: 'light',
      translucent: true,
    });
    expect(
      getTestId(renderer.root, 'tabs-safe-area').props.style
    ).toEqual(
      expect.objectContaining({ backgroundColor: '#11222c' })
    );
    await unmountLayout(renderer);
  });
});
