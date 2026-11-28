/**
 * WH-351 (Test's phone finding): with Gujarati saved on the phone, a cold start that ends on one of the screens shown
 * before the app opens (app/_layout.tsx) must draw that screen in Gujarati. The language is the saved choice, not the
 * phone's.
 *
 * Real: `RootLayout` and its bootstrap, the Redux store and its rehydration, the facility check, the offline start and
 * its 30-day limit, i18n, and the screens themselves. Faked: what is on the phone (AsyncStorage, SecureStore), the
 * network (`fetch`), the phone's language, and native modules (the navigator, safe area, bottom sheet, NetInfo, camera,
 * system bars).
 *
 * Each case is a cold start: a fresh module registry, so no language, store or session is left from the case before.
 */
import type { ComponentType } from 'react';
import type * as TestingLibrary from '@testing-library/react-native/pure';

// The real library: Jest picks its ESM build, which it cannot load, so the same package's CommonJS build is named.
jest.mock('react-redux', () => jest.requireActual('../../../node_modules/react-redux/dist/cjs/index.js'));
jest.mock('@react-native-community/netinfo',() => require('@react-native-community/netinfo/jest/netinfo-mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: ({ children }: { children: unknown }) => children }));
// The date picker library: only its translation registry is used at start, and Jest cannot load its colour package.
jest.mock('react-native-paper-dates', () => ({ en: {}, registerTranslation: jest.fn() }));
jest.mock('expo-system-ui',() => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-navigation-bar', () => ({ setStyle: jest.fn() }));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [null, jest.fn()] }));
// The native navigator: each registered screen is drawn as its title. It counts how often it is built.
let mockStackBuilds = 0;
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  const Stack = ({ children }: { children: unknown }) => {
    React.useEffect(() => {
      mockStackBuilds += 1;
    }, []);
    return React.createElement(View, null, children);
  };
  Stack.Screen = ({ options }: { options?: { title?: string } }) =>
    options?.title ? React.createElement(Text, null, options.title) : null;
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), canGoBack: () => false, dismissAll: jest.fn() };
  return {
    Stack,
    router,
    useRouter: () => router,
    useSegments: () => ['login'],
    usePathname: () => '/login',
    useGlobalSearchParams: () => ({}),
    useLocalSearchParams: () => ({}),
    useRootNavigationState: () => ({ key: 'root', routes: [{ name: 'login' }], index: 0 }),
    useNavigationContainerRef: () => ({ isReady: () => true, addListener: () => () => undefined }),
    useNavigation: () => ({ addListener: () => () => undefined }),
    useFocusEffect: () => undefined,
    DarkTheme: { colors: {}, fonts: {} },
    DefaultTheme: { colors: {}, fonts: {} },
    ThemeProvider: ({ children }: { children: unknown }) => children,
  };
});

const ORIGIN = 'https://warehouse.example.test';
const SERVER = { origin: ORIGIN, instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Company' };
const jwt = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const DAY = 24 * 60 * 60 * 1000;

const publicConfig = (over: object = {}) => ({
  supabaseUrl: ORIGIN,
  anonKey: jwt({ role: 'anon', exp: 9999999999 }),
  environment: 'production',
  version: '0.1.0',
  maintenanceMode: false,
  instanceId: SERVER.instanceId,
  displayName: SERVER.displayName,
  companyName: SERVER.companyName,
  canonicalOrigin: ORIGIN,
  supportedApiVersions: ['1'],
  minimumClientVersion: '0.1.0',
  capabilities: { sync: true },
  urls: { publicConfig: `${ORIGIN}/functions/v1/get-public-config`, fullConfig: `${ORIGIN}/functions/v1/get-config` },
  ...over,
});

type Language = 'en' | 'gu';
type Network = 'unreachable' | { config: object };
interface Phone {
  language: Language;
  /** The facility chosen on this phone; left out, none was chosen yet. */
  server?: boolean;
  /** A staff member signed in, whom the server last confirmed this many days ago, at a facility with the offline feature. */
  signedInDaysAgo?: number;
  network: Network;
}

// Loading the whole app afresh for each cold start takes longer than Jest's five seconds on the first case.
jest.setTimeout(60_000);

let app: { rtl: typeof TestingLibrary } | null = null;
const realFetch = global.fetch;
const realDev = (global as { __DEV__?: boolean }).__DEV__;

/** Puts `phone` in storage and starts the app from nothing. */
async function coldStart(phone: Phone) {
  jest.resetModules();
  const storage = require('@react-native-async-storage/async-storage');
  const AsyncStorage = storage.default ?? storage;
  await AsyncStorage.clear();
  // What redux-persist keeps: every slice as its own JSON string.
  await AsyncStorage.setItem(
    'persist:root',
    JSON.stringify({
      theme: JSON.stringify({ preference: 'light', brand: 'orange', language: phone.language }),
      _persist: JSON.stringify({ version: -1, rehydrated: true }),
    })
  );
  if (phone.server) await AsyncStorage.setItem('operator_server_v1', JSON.stringify(SERVER));

  const secure = new Map<string, string>();
  if (phone.signedInDaysAgo !== undefined) {
    const confirmed = Date.now() - phone.signedInDaysAgo * DAY;
    await AsyncStorage.setItem(
      'offline_start_v1',
      JSON.stringify({ origin: ORIGIN, instanceId: SERVER.instanceId, config: publicConfig(), savedAt: confirmed })
    );
    secure.set('secure_auth_token', jwt({ sub: 'user-1', session_id: 'session-1', exp: Math.floor(confirmed / 1000) + 3600 }));
    secure.set('secure_refresh_token', 'fictional-refresh');
    secure.set('secure_token_expires', String(confirmed + 3600 * 1000));
    secure.set('secure_operator_identity', `${ORIGIN}|${SERVER.instanceId}`);
    secure.set(
      'cached_user_profile',
      JSON.stringify({
        profile: { id: 'profile-1', auth_user_id: 'user-1', role: 'staff', name: 'Asha Fictional' },
        cachedAt: confirmed,
        confirmedAt: confirmed,
        scope: JSON.stringify([ORIGIN, 'user-1', 'session-1']),
      })
    );
  }
  const SecureStore = require('expo-secure-store');
  SecureStore.getItemAsync.mockImplementation(async (key: string) => secure.get(key) ?? null);
  SecureStore.setItemAsync.mockImplementation(async (key: string, value: string) => void secure.set(key, value));
  SecureStore.deleteItemAsync.mockImplementation(async (key: string) => void secure.delete(key));

  const rtl = require('@testing-library/react-native/pure') as typeof TestingLibrary;
  // The matchers of this same registry: `toBeOnTheScreen` asks the library that rendered.
  require('../../../node_modules/@testing-library/react-native/dist/matchers/extend-expect');
  app = { rtl };
  const RootLayout = (require('../../../app/_layout') as { default: ComponentType }).default;

  // After the app is loaded: loading Expo installs its own global fetch.
  const network = phone.network;
  global.fetch = jest.fn(async (input: unknown) => {
    if (network !== 'unreachable' && String(input) === `${ORIGIN}/functions/v1/get-public-config`)
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true, data: network.config }) } as Response;
    throw new TypeError('Network request failed');
  }) as typeof fetch;

  await rtl.render(<RootLayout />);
  return rtl;
}

type Screen = typeof TestingLibrary.screen;
const text = (screen: Screen, value: string) => expect(screen.getByText(value)).toBeOnTheScreen();
const noText = (screen: Screen, value: string) => expect(screen.queryByText(value)).not.toBeOnTheScreen();
const button = (screen: Screen, name: string) => expect(screen.getByRole('button', { name })).toBeOnTheScreen();

// Each screen shown before the app opens: how the phone gets there, and its words in both languages.
const SCREENS: {
  name: string;
  phone: Omit<Phone, 'language'>;
  words: Record<Language, { title: string; texts: string[]; buttons: string[] }>;
}[] = [
  {
    name: 'past the 30-day offline limit',
    phone: { server: true, signedInDaysAgo: 31, network: 'unreachable' },
    words: {
      en: {
        title: 'Connect to continue',
        texts: ["This phone hasn't connected to your cold storage for over 30 days. Connect to the internet to sign in again."],
        buttons: ['Try connecting again', 'Change warehouse server'],
      },
      gu: {
        title: 'આગળ વધવા ઇન્ટરનેટ જોડો',
        texts: ['આ ફોન ૩૦ દિવસથી વધુ સમયથી તમારા કોલ્ડ સ્ટોરેજ સાથે જોડાયો નથી. ફરી લૉગિન કરવા ઇન્ટરનેટ જોડો.'],
        buttons: ['ફરી જોડાવાનો પ્રયાસ કરો', 'કોલ્ડ સ્ટોરેજનું સર્વર બદલો'],
      },
    },
  },
  {
    name: "today's configuration error",
    phone: { server: true, network: 'unreachable' },
    words: {
      en: {
        title: "Couldn't load app settings",
        texts: [
          "The app couldn't get its settings from the warehouse server, so your data stays hidden for now. Check your connection and try again.",
          'If this keeps happening, contact your facility.',
        ],
        buttons: ['Retry loading configuration', 'Change warehouse server'],
      },
      gu: {
        title: 'ઍપના સેટિંગ લોડ કરી શકાયા નથી',
        texts: [
          'ઍપને કોલ્ડ સ્ટોરેજના સર્વર પરથી તેના સેટિંગ મળ્યા નથી, તેથી તમારો ડેટા હાલ છુપાવેલો રહેશે. તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.',
          'આવું વારંવાર થાય તો તમારા કોલ્ડ સ્ટોરેજનો સંપર્ક કરો.',
        ],
        buttons: ['સેટિંગ ફરી લોડ કરો', 'કોલ્ડ સ્ટોરેજનું સર્વર બદલો'],
      },
    },
  },
  {
    name: 'update the app',
    phone: { server: true, network: { config: publicConfig({ minimumClientVersion: '999.0.0' }) } },
    words: {
      en: { title: 'Update the app', texts: [], buttons: ['Back'] },
      gu: { title: 'ઍપ અપડેટ કરો', texts: [], buttons: ['પાછળ'] },
    },
  },
  {
    name: 'the backend is too old',
    phone: { server: true, network: { config: publicConfig({ schemaHead: '00000000000001_fictional' }) } },
    words: {
      en: {
        title: "This facility's server needs an update",
        texts: ["The facility's server is older than this version of the app works with. Ask the facility to update its server, then try again."],
        buttons: ['Back'],
      },
      gu: {
        title: 'આ કોલ્ડ સ્ટોરેજના સર્વરને અપડેટ કરવાની જરૂર છે',
        texts: ['કોલ્ડ સ્ટોરેજનું સર્વર આ એપ્લિકેશનના વર્ઝન સાથે ચાલવા માટે બહુ જૂનું છે. કોલ્ડ સ્ટોરેજને તેનું સર્વર અપડેટ કરવા કહો, પછી ફરી પ્રયાસ કરો.'],
        buttons: ['પાછળ'],
      },
    },
  },
  {
    name: 'server choice',
    phone: { network: 'unreachable' },
    words: {
      en: { title: 'Choose your warehouse server', texts: [], buttons: ['Check server'] },
      gu: { title: 'તમારા કોલ્ડ સ્ટોરેજનું સર્વર પસંદ કરો', texts: ['સર્વરનું સરનામું'], buttons: ['સર્વર તપાસો'] },
    },
  },
];

/** The phone's own language, which a saved choice overrides. */
function phoneLanguage(locale: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...real.call(this), locale };
  });
}

beforeAll(() => {
  // A release build: no three-second splash wait after a verified start.
  (global as { __DEV__?: boolean }).__DEV__ = false;
});
afterAll(() => {
  (global as { __DEV__?: boolean }).__DEV__ = realDev;
  global.fetch = realFetch;
});
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await app?.rtl.cleanup();
  app = null;
  jest.restoreAllMocks();
});

describe.each(SCREENS)('a cold start that ends on: $name', ({ phone, words }) => {
  it.each([
    { saved: 'gu', other: 'en', device: 'en-IN' },
    { saved: 'en', other: 'gu', device: 'gu-IN' },
  ] as const)('saved language $saved, phone in $device: the screen is in $saved', async ({ saved, other, device }) => {
    phoneLanguage(device);
    const { screen } = await coldStart({ ...phone, language: saved });
    // The screen is up once its title shows in either language; which one is then asserted.
    expect(await screen.findByText(new RegExp(`^(${words.en.title}|${words.gu.title})$`))).toBeOnTheScreen();
    text(screen, words[saved].title);
    noText(screen, words[other].title);
    for (const value of words[saved].texts) text(screen, value);
    for (const name of words[saved].buttons) button(screen, name);
  });
});

describe('the app itself, once open', () => {
  it('opens in the saved language, and a change of language rebuilds the screens in the new one', async () => {
    phoneLanguage('en-IN');
    mockStackBuilds = 0;
    const rtl = await coldStart({ language: 'gu', server: true, network: { config: publicConfig() } });
    const { screen } = rtl;
    expect(await screen.findByText('મારાં કોલ્ડ સ્ટોરેજ')).toBeOnTheScreen();
    noText(screen, 'My facilities');
    expect(mockStackBuilds).toBe(1);
    const { store } = require('@/store') as typeof import('@/store');
    const { setLanguagePreference } = require('@/store/slices/themeSlice') as typeof import('@/store/slices/themeSlice');
    await rtl.act(async () => {
      store.dispatch(setLanguagePreference('en'));
    });
    expect(await screen.findByText('My facilities')).toBeOnTheScreen();
    noText(screen, 'મારાં કોલ્ડ સ્ટોરેજ');
    // Built again, not only redrawn: every screen under it starts over in the new language.
    expect(mockStackBuilds).toBe(2);
  });
});
