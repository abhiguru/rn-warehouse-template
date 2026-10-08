import React from 'react';
import { Linking } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { usePathname, useRouter } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { parseDeepLinkUrl, useColdStartDeepLink } from '../useColdStartDeepLink';

jest.mock('@/store/hooks', () => ({ useAppSelector: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

describe('parseDeepLinkUrl', () => {
  const originalScheme = process.env.EXPO_PUBLIC_APP_SCHEME;

  afterEach(() => {
    if (originalScheme === undefined) {
      delete process.env.EXPO_PUBLIC_APP_SCHEME;
    } else {
      process.env.EXPO_PUBLIC_APP_SCHEME = originalScheme;
    }
  });

  it('ignores the Expo development-client bootstrap URL', () => {
    expect(
      parseDeepLinkUrl(
        'warehousemanager://expo-development-client/?url=http%3A%2F%2Flocalhost%3A18081'
      )
    ).toBeNull();
  });

  it('continues to parse application deep links', () => {
    expect(parseDeepLinkUrl('warehousemanager://grn-details/grn-123')).toBe(
      '/grn-details/grn-123'
    );
  });

  it('uses the configured application scheme for the bootstrap exclusion', () => {
    process.env.EXPO_PUBLIC_APP_SCHEME = 'warehouse-review';

    expect(
      parseDeepLinkUrl(
        'warehouse-review://expo-development-client/?url=http%3A%2F%2Flocalhost%3A18081'
      )
    ).toBeNull();
    expect(parseDeepLinkUrl('warehouse-review://invoice-details/invoice-123')).toBe(
      '/invoice-details/invoice-123'
    );
  });
});

describe('useColdStartDeepLink warm links', () => {
  const replace = jest.fn();
  let renderer: ReactTestRenderer | undefined;
  let urlListener: ((event: { url: string }) => void) | undefined;

  function Harness() {
    useColdStartDeepLink(true);
    return null;
  }

  beforeEach(() => {
    replace.mockReset();
    urlListener = undefined;
    (useRouter as jest.Mock).mockReturnValue({ replace });
    (usePathname as jest.Mock).mockReturnValue('/(tabs)');
    (useAppSelector as jest.Mock).mockReturnValue({
      userProfile: { id: 'admin-user' },
      isLoading: false,
    });
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'url') {
        urlListener = listener as (event: { url: string }) => void;
      }
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    if (renderer) {
      act(() => renderer?.unmount());
      renderer = undefined;
    }
    jest.restoreAllMocks();
  });

  it('navigates a running authenticated app when a warm link arrives', async () => {
    await act(async () => {
      renderer = create(React.createElement(Harness));
      await Promise.resolve();
    });

    expect(urlListener).toBeDefined();

    await act(async () => {
      urlListener?.({ url: 'warehousemanager://customers' });
    });

    expect(replace).toHaveBeenCalledWith('/customers');
  });
});
