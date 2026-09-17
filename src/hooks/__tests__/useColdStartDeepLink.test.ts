import { parseDeepLinkUrl } from '../useColdStartDeepLink';

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
