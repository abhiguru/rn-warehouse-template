/**
 * WH-301 (Design findings on the Unsent items screen, Dev f6398da2, acd53f42, 13361e50, 73d281d9): the header and Back, the
 * "Not sent yet" count that matches the status bar, the tag of a photos row ("Waiting for its GRN" while its new GRN is unsent)
 * and the title of a photos row before and after its GRN is sent (the server's number, identifiers 0-9 in Gujarati).
 *
 * Real: `UnsentItemsScreen`, `UnsentRow`, `unsentList`, the queue (items are saved through `enqueue` / `enqueueAll`), the unsent
 * file, `OfflineStatusBar` with `useUnsentSummary`, `HeaderBackButton`, i18n. Faked at the edge: expo-sqlite, files, secure-store,
 * NetInfo, the signed-in person, the router (its `Stack.Screen` draws the header only when the options say `headerShown`, as the
 * root stack hides it otherwise), the list component, the phone-copy status hook (the feature is off, so the bar is unsent-only).
 */
import React from 'react';
import { View } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { env } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, rawRun, unsentFileNames } from '@/tests/unsent/unsentPhone';
import { initUnsent, refreshUnsent, getUnsentSummary } from '@/features/unsent/unsentStore';
import { enqueue, enqueueAll } from '@/features/unsent/unsentQueue';
import { registerSendKind } from '@/features/unsent/sendKinds';
import { UnsentItemsScreen } from '@/features/unsent/UnsentItemsScreen';
import { OfflineStatusBar } from '@/components/OfflineStatusBar';
import { saveOperatorServer } from '@/config/operatorServer';
import { setFacilityCapabilities } from '@/config/facilityCapabilities';
import { businessDate } from '@/features/phone-copy/pgCompat';
import { setLanguage } from '@/i18n';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('@/config/supabaseConfig', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('expo-router', () => {
  const { Text, View: Box } = require('react-native');
  // The root stack hides every header; a screen shows its own by `headerShown: true`.
  const Screen = ({ options }: { options: { title?: string; headerShown?: boolean; headerLeft?: () => unknown } }) =>
    options.headerShown === true ? (
      <Box testID="stack-header">
        {options.headerLeft ? options.headerLeft() : null}
        <Text testID="stack-header-title">{options.title}</Text>
      </Box>
    ) : null;
  return { router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() }, Stack: { Screen }, useRouter: () => ({ push: jest.fn(), back: jest.fn() }) };
});
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/hooks/usePhoneCopyStatus', () => ({
  useCopySession: () => true,
  useCopyFeatureOn: () => false,
  usePhoneCopyStatus: () => ({ feature: 'off', phase: 'empty', running: null, current: false, asOf: null, lastRunFailed: false, storageLow: false, copyBytes: null }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/alert', () => ({ askAlert: jest.fn(), showAlert: jest.fn() }));
jest.mock('@/store/hooks', () => {
  const state = { auth: { userProfile: { id: 'profile-1', role: 'staff' } }, theme: jest.requireActual('@/store/slices/themeSlice').default(undefined, { type: 'init' }) };
  return { useAppSelector: (select: (s: unknown) => unknown) => select(state), useAppDispatch: () => () => undefined };
});

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const GRN = { kind: 'testRecord', body: {}, what: 'GRN for Asha Fictional Traders', customer: 'Asha Fictional Traders' };
const EXISTING = { number: 'RV15009', grnId: 'grn-9' };
const photosInput = (name: string, extra: { dependsOn?: number } = {}) => ({
  kind: 'photos',
  body: { doc: 'grn' as const },
  what: 'Photos',
  photos: [{ file: addPhoto(name), role: 'header' }],
  ...extra,
});

/** The screen and the unsent-only bar, as the layout draws them together. */
const open = async () => {
  await initUnsent();
  await render(
    <GestureHandlerRootView>
      <View>
        <OfflineStatusBar unsentOnly />
        <UnsentItemsScreen />
      </View>
    </GestureHandlerRootView>
  );
  await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
};
/** The GRN is now on the server: sent today, with the number the server gave. */
const markSent = async (id: string, grNo: string) => {
  await rawRun(`UPDATE items SET state = 'sent', sent_day = '${businessDate(Date.now())}', result = '${JSON.stringify({ gr_no: grNo, grn_id: `grn-${grNo}` })}' WHERE id = '${id}'`);
  await refreshUnsent();
};
const sectionCount = () => screen.getByTestId('unsent-section-unsent');

beforeAll(async () => {
  await saveOperatorServer(SERVER);
  registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'transient' }) });
  // The server never answers in these tests: a photos item with no GRN to wait for must stay "saved", not be sent by the engine.
  registerSendKind('photos', { lane: 'photo', send: async () => ({ kind: 'transient' }) });
  await initUnsent();
});
beforeEach(async () => {
  jest.clearAllMocks();
  files.reset();
  env.subject = 'user-1';
  setFacilityCapabilities(SERVER, { sync: false });
  if (unsentFileNames().length > 0) { await rawRun('DELETE FROM forms'); await rawRun('DELETE FROM items'); await rawRun('DELETE FROM item_photos'); }
  await refreshUnsent();
});
afterEach(() => { setLanguage('en'); });

describe('the header', () => {
  it('shows the title "Unsent items" and a Back button that goes back', async () => {
    await enqueue(GRN);
    await open();
    expect(screen.getByTestId('stack-header-title')).toHaveTextContent('Unsent items');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('the count of "Not sent yet" and the bar', () => {
  it('a new GRN and its own photo count 1 in the section and 1 in the bar', async () => {
    const [, photo] = await enqueueAll([GRN, photosInput('a.jpg', { dependsOn: 0 })]);
    await open();
    expect(photo.id).toBeTruthy();
    expect(sectionCount()).toHaveTextContent(/not sent yet.*1$/i);
    expect(screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('1 item not sent yet. Tap to see it.');
    expect(getUnsentSummary().count).toBe(1);
    // Both rows are still on the screen: the photo is a row of its own, tagged as waiting.
    expect(screen.getByText('GRN for Asha Fictional Traders')).toBeOnTheScreen();
    expect(screen.getByText('1 photo for the new GRN')).toBeOnTheScreen();
  });

  it('a photo whose GRN was already sent counts on its own', async () => {
    const [grn] = await enqueueAll([GRN, photosInput('a.jpg', { dependsOn: 0 })]);
    await markSent(grn.id, 'RV15042');
    await open();
    expect(sectionCount()).toHaveTextContent(/not sent yet.*1$/i);
    expect(screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('1 item not sent yet. Tap to see it.');
  });

  it('a photo of an edited existing GRN (not a new one) counts on its own', async () => {
    await enqueue({ ...photosInput('a.jpg'), dependsOn: undefined, targetRef: EXISTING });
    await open();
    expect(sectionCount()).toHaveTextContent(/not sent yet.*1$/i);
    expect(screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('1 item not sent yet. Tap to see it.');
    expect(screen.getByText('1 photo for GRN RV15009')).toBeOnTheScreen();
  });

  it('2 GRNs, one with 2 photos: the section and the bar both say 2', async () => {
    await enqueueAll([GRN, photosInput('a.jpg', { dependsOn: 0 }), photosInput('b.jpg', { dependsOn: 0 })]);
    await enqueue({ ...GRN, what: 'GRN for Bina Fictional Stores' });
    await open();
    expect(sectionCount()).toHaveTextContent(/not sent yet.*2$/i);
    expect(screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('2 items not sent yet. Tap to see them.');
    expect(getUnsentSummary().count).toBe(2);
    expect(screen.getAllByText('1 photo for the new GRN')).toHaveLength(2);
  });
});

describe('the tag of a photos row', () => {
  it('while its new GRN is unsent the photo says "Waiting for its GRN" and the GRN "Saved on phone"', async () => {
    const [grn, photo] = await enqueueAll([GRN, photosInput('a.jpg', { dependsOn: 0 })]);
    await open();
    expect(screen.getByTestId(`unsent-row-tag-${photo.id}`)).toHaveTextContent('Waiting for its GRN');
    expect(screen.getByTestId(`unsent-row-tag-${grn.id}`)).toHaveTextContent('Saved on phone');
  });

  it('once the GRN is sent the photo says "Saved on phone", no longer waiting', async () => {
    const [grn, photo] = await enqueueAll([GRN, photosInput('a.jpg', { dependsOn: 0 })]);
    await markSent(grn.id, 'RV15042');
    await open();
    expect(screen.getByTestId(`unsent-row-tag-${photo.id}`)).toHaveTextContent('Saved on phone');
    expect(screen.queryByText('Waiting for its GRN')).not.toBeOnTheScreen();
  });

  it('a photo of an existing GRN is never waiting', async () => {
    const { id } = await enqueue({ ...photosInput('a.jpg'), dependsOn: undefined, targetRef: EXISTING });
    await open();
    expect(screen.getByTestId(`unsent-row-tag-${id}`)).toHaveTextContent('Saved on phone');
  });
});

describe('the title of a photos row', () => {
  it('before the send it says "the new GRN", after it names the GRN by the server\'s number', async () => {
    const [grn] = await enqueueAll([GRN, photosInput('a.jpg', { dependsOn: 0 })]);
    await open();
    expect(screen.getByText('1 photo for the new GRN')).toBeOnTheScreen();
    await act(async () => { await markSent(grn.id, 'RV15042'); await new Promise(resolve => setImmediate(resolve)); });
    expect(screen.getByText('1 photo for GRN RV15042')).toBeOnTheScreen();
    expect(screen.queryByText('1 photo for the new GRN')).not.toBeOnTheScreen();
  });

  it('two photos of a sent GRN say "2 photos for GRN ..."', async () => {
    const [grn] = await enqueueAll([GRN, { ...photosInput('a.jpg', { dependsOn: 0 }), photos: [{ file: addPhoto('a.jpg'), role: 'header' }, { file: addPhoto('b.jpg'), role: 'item' }] }]);
    await markSent(grn.id, 'RV15042');
    await open();
    expect(screen.getByText('2 photos for GRN RV15042')).toBeOnTheScreen();
  });

  it('in Gujarati the title is Gujarati, the count has Gujarati digits and the GRN number keeps 0-9', async () => {
    const [grn] = await enqueueAll([GRN, photosInput('a.jpg', { dependsOn: 0 })]);
    await markSent(grn.id, 'RV15042');
    setLanguage('gu');
    await open();
    expect(screen.getByText('આવક પાવતી RV15042 ના ૧ ફોટો')).toBeOnTheScreen();
  });

  it('in Gujarati, before the send, it says "the new GRN" in Gujarati', async () => {
    await enqueueAll([GRN, photosInput('a.jpg', { dependsOn: 0 })]);
    setLanguage('gu');
    await open();
    expect(screen.getByText('નવી આવક પાવતીના ૧ ફોટો')).toBeOnTheScreen();
  });
});
