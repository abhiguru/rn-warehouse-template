import React from 'react';
import { Linking } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { parseDeepLinkUrl, useColdStartDeepLink } from '../useColdStartDeepLink';

jest.mock('@/store/hooks', () => ({ useAppSelector: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useGlobalSearchParams: jest.fn(),
}));

// The scheme comes from the build's own configuration (app.config.js sets it from
// WAREHOUSE_APP_SCHEME), read through expo-constants, so the native registration and the replay
// parser cannot disagree (M05).
let mockScheme: string | string[] | undefined = 'warehousemanager';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockScheme === undefined ? {} : { scheme: mockScheme };
    },
  },
}));

describe('parseDeepLinkUrl', () => {
  const originalScheme = process.env.EXPO_PUBLIC_APP_SCHEME;

  beforeEach(() => {
    mockScheme = 'warehousemanager';
  });

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

  it.each([
    'https://evil.example/settings',
    'http://evil.example/grn-details/grn-123',
    'HTTPS://facility.example/users',
  ])('does not treat the web address %s as an app route', (url) => {
    expect(parseDeepLinkUrl(url)).toBeNull();
  });

  it('uses the configured application scheme for the bootstrap exclusion', () => {
    mockScheme = 'warehouse-review';

    expect(
      parseDeepLinkUrl(
        'warehouse-review://expo-development-client/?url=http%3A%2F%2Flocalhost%3A18081'
      )
    ).toBeNull();
    expect(parseDeepLinkUrl('warehouse-review://invoice-details/invoice-123')).toBe(
      '/invoice-details/invoice-123'
    );
  });

  describe('the scheme is the build\'s own, compared as text (M05)', () => {
    it('reads a scheme that holds a plus sign: warehouse+review is replayed', () => {
      mockScheme = 'warehouse+review';

      expect(parseDeepLinkUrl('warehouse+review://grn-details/x')).toBe('/grn-details/x');
      expect(
        parseDeepLinkUrl('warehouse+review://expo-development-client/?url=http%3A%2F%2Flocalhost%3A18081')
      ).toBeNull();
    });

    it('does not take a dot for a wildcard: warehouse.review does not match warehouseXreview', () => {
      mockScheme = 'warehouse.review';

      expect(parseDeepLinkUrl('warehouseXreview://grn-details/x')).toBeNull();
      expect(parseDeepLinkUrl('warehouse.review://grn-details/x')).toBe('/grn-details/x');
      // The bootstrap URL of another scheme is not the development client of this build either.
      expect(parseDeepLinkUrl('warehouseXreview://expo-development-client/?url=x')).toBeNull();
    });

    it('does not take a plus sign for a quantifier: warehouse+review does not match warehouseeeereview', () => {
      mockScheme = 'warehouse+review';

      expect(parseDeepLinkUrl('warehouseeeereview://grn-details/x')).toBeNull();
    });

    it('accepts any scheme of the array form, and no other', () => {
      mockScheme = ['warehouse-first', 'warehouse+second'];

      expect(parseDeepLinkUrl('warehouse-first://grn-details/a')).toBe('/grn-details/a');
      expect(parseDeepLinkUrl('warehouse+second://grn-details/b')).toBe('/grn-details/b');
      expect(parseDeepLinkUrl('warehousemanager://grn-details/c')).toBeNull();
      expect(
        parseDeepLinkUrl('warehouse+second://expo-development-client/?url=http%3A%2F%2Flocalhost%3A18081')
      ).toBeNull();
    });

    it('accepts an upper-case scheme (schemes are case-insensitive) and keeps the route\'s case', () => {
      expect(parseDeepLinkUrl('WAREHOUSEMANAGER://grn-details/AbC-123')).toBe('/grn-details/AbC-123');
      expect(parseDeepLinkUrl('WarehouseManager://invoice-details/Inv-9?Tab=Items#Top')).toBe(
        '/invoice-details/Inv-9?Tab=Items#Top'
      );
      mockScheme = 'Warehouse-Review';
      expect(parseDeepLinkUrl('warehouse-review://grn-details/Zz')).toBe('/grn-details/Zz');
      // The bootstrap URL is recognised under an upper-case scheme too.
      expect(
        parseDeepLinkUrl('WAREHOUSE-REVIEW://expo-development-client/?url=http%3A%2F%2Flocalhost%3A18081')
      ).toBeNull();
    });

    it('rejects a web address even when it is written in upper case', () => {
      expect(parseDeepLinkUrl('HTTPS://facility.example/users')).toBeNull();
      expect(parseDeepLinkUrl('Http://evil.example/grn-details/x')).toBeNull();
    });

    it('falls back to warehousemanager when the build names no scheme', () => {
      mockScheme = undefined;
      expect(parseDeepLinkUrl('warehousemanager://grn-details/x')).toBe('/grn-details/x');

      mockScheme = [];
      expect(parseDeepLinkUrl('warehousemanager://grn-details/x')).toBe('/grn-details/x');
      expect(parseDeepLinkUrl('other://grn-details/x')).toBeNull();
    });

    it('does not read EXPO_PUBLIC_APP_SCHEME any more', () => {
      process.env.EXPO_PUBLIC_APP_SCHEME = 'warehouse-ignored';

      expect(parseDeepLinkUrl('warehouse-ignored://grn-details/x')).toBeNull();
      expect(parseDeepLinkUrl('warehousemanager://grn-details/x')).toBe('/grn-details/x');
    });

    it('keeps refusing an empty route and a link that holds a line break', () => {
      expect(parseDeepLinkUrl('warehousemanager://')).toBeNull();
      expect(parseDeepLinkUrl('warehousemanager://grn-details/x\ny')).toBeNull();
    });
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
    (useGlobalSearchParams as jest.Mock).mockReturnValue({});
    (useAppSelector as jest.Mock).mockReturnValue({
      userProfile: { id: 'admin-user' },
      isLoading: false,
    });
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'url') {
        urlListener = listener as (event: { url: string }) => void;
      }
      // Only `remove` is used by the hook.
      return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>;
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

  it('does not open again a link with a query that expo-router has already opened (A26)', async () => {
    // expo-router has pushed the report: the path is shown, with the link's query as its params.
    (usePathname as jest.Mock).mockReturnValue('/reports/stock-aging');
    (useGlobalSearchParams as jest.Mock).mockReturnValue({ customerId: 'customer-17' });
    await act(async () => {
      renderer = create(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      urlListener?.({ url: 'warehousemanager://reports/stock-aging?customerId=customer-17' });
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['a fragment only', 'warehousemanager://reports/stock-aging#totals'],
    ['a `?` inside the fragment', 'warehousemanager://reports/stock-aging#totals?customerId=customer-17'],
  ])('does not open again a link with %s that expo-router has already opened (A26)', async (_name, url) => {
    (usePathname as jest.Mock).mockReturnValue('/reports/stock-aging');
    await act(async () => {
      renderer = create(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      urlListener?.({ url });
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it('opens a link to the screen shown with another query (another customer)', async () => {
    (usePathname as jest.Mock).mockReturnValue('/reports/stock-aging');
    (useGlobalSearchParams as jest.Mock).mockReturnValue({ customerId: 'customer-5' });
    await act(async () => {
      renderer = create(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      urlListener?.({ url: 'warehousemanager://reports/stock-aging?customerId=customer-17' });
    });

    expect(replace).toHaveBeenCalledWith('/reports/stock-aging?customerId=customer-17');
  });

  it('still opens a link with a query whose path is not the one shown', async () => {
    await act(async () => {
      renderer = create(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      urlListener?.({ url: 'warehousemanager://reports/stock-aging?customerId=customer-17' });
    });

    expect(replace).toHaveBeenCalledWith('/reports/stock-aging?customerId=customer-17');
  });

  it.each(['/otp', '/login', '/operator-server', '/pending-enrollment'])(
    'leaves the sign-in screen %s in place when a warm link arrives',
    async (path) => {
      (usePathname as jest.Mock).mockReturnValue(path);
      (useAppSelector as jest.Mock).mockReturnValue({ userProfile: null, isLoading: false });
      await act(async () => {
        renderer = create(React.createElement(Harness));
        await Promise.resolve();
      });

      await act(async () => {
        urlListener?.({ url: 'warehousemanager://login' });
        urlListener?.({ url: 'warehousemanager://settings' });
      });

      expect(replace).not.toHaveBeenCalled();
    }
  );
});

describe('useColdStartDeepLink cold-start links', () => {
  const replace = jest.fn();
  let renderer: ReactTestRenderer | undefined;
  const LINK = 'warehousemanager://reports/stock-aging?customerId=customer-17';

  function Harness() {
    useColdStartDeepLink(true);
    return null;
  }

  beforeEach(() => {
    replace.mockReset();
    (useRouter as jest.Mock).mockReturnValue({ replace });
    // The auth restore is still running when the app starts from the link.
    (useAppSelector as jest.Mock).mockReturnValue({ userProfile: null, isLoading: true });
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(LINK);
    jest.spyOn(Linking, 'addEventListener').mockImplementation(
      () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof Linking.addEventListener>
    );
  });

  afterEach(() => {
    if (renderer) {
      act(() => renderer?.unmount());
      renderer = undefined;
    }
    jest.restoreAllMocks();
  });

  /** Starts from `link` on `shownPath`, then lets the auth restore finish signed in. */
  async function startThenSignIn(shownPath: string, link = LINK) {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(link);
    (usePathname as jest.Mock).mockReturnValue(shownPath);
    await act(async () => {
      renderer = create(React.createElement(Harness));
      await Promise.resolve();
    });
    (useAppSelector as jest.Mock).mockReturnValue({ userProfile: { id: 'admin-user' }, isLoading: false });
    await act(async () => {
      renderer?.update(React.createElement(Harness));
      await Promise.resolve();
    });
  }

  it('does not open again a link with a query that expo-router has already opened (A26)', async () => {
    // expo-router has opened the report: the path is shown, without its query.
    await startThenSignIn('/reports/stock-aging');
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['a fragment only', 'warehousemanager://reports/stock-aging#totals'],
    ['a `?` inside the fragment', 'warehousemanager://reports/stock-aging#totals?customerId=customer-17'],
  ])('does not open again a link with %s that expo-router has already opened (A26)', async (_name, link) => {
    await startThenSignIn('/reports/stock-aging', link);
    expect(replace).not.toHaveBeenCalled();
  });

  it('still opens a link with a query whose path is not the one shown', async () => {
    await startThenSignIn('/(tabs)');
    expect(replace).toHaveBeenCalledWith('/reports/stock-aging?customerId=customer-17');
  });
});
