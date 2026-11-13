/**
 * WH-158 (contract section 7, criteria 10, 14 and 15): Reports > Accountant pack. The real screen runs with the real service; only the
 * server's reply (fetch) and the native share are faked. Written BEFORE the build: fails today because app/reports/accountant-pack.tsx
 * does not exist. Some mocks below stand in for the app shell and may need a line when the screen's own imports are known.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AccountantPackScreen from '../../../app/reports/accountant-pack';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { setLanguage, t } from '@/i18n';
import { toLocalISODate } from '@/utils/formatters';
import { showAlert } from '@/utils/alert';
import { shareFileBytes } from '@/utils/shareDocument';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange', language: 'en' }, auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/features/reports/useFacilityName', () => ({ useFacilityName: () => 'Riverside' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ ...jest.requireActual('@/utils/shareDocument'), shareFileBytes: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'https://warehouse.example.test' }),
  createAuthenticatedFetch: jest.fn(() => (...args: Parameters<typeof fetch>) => global.fetch(...args)),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn(async () => 'fictional-access-credential') }));

const originalFetch = global.fetch;
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 3, 4]).buffer;
const zipAnswer = () => ({
  ok: true, status: 200,
  headers: { get: (n: string) => ({ 'content-type': 'application/zip', 'content-disposition': "attachment; filename*=UTF-8''riverside-accountant-pack-2026-10.zip" }[n.toLowerCase()] ?? null) },
  arrayBuffer: async () => ZIP_BYTES, json: async () => { throw new Error('not json'); },
}) as any;
const refusal = (status: number, code: string) => ({
  ok: false, status, headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => ({ success: false, error: 'Server text.', code }), arrayBuffer: jest.fn(), text: async () => '',
}) as any;

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  // Only Date is faked: "today" is 14 November 2026, so the last complete month is October 2026.
  jest.useFakeTimers({ now: new Date('2026-11-14T06:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
  setLanguage('en');
  global.fetch = jest.fn();
  jest.mocked(showAlert).mockClear();
  jest.mocked(shareFileBytes).mockReset();
  jest.mocked(shareFileBytes).mockResolvedValue({ success: true });
  ['log', 'info', 'warn', 'error', 'debug'].forEach(m => jest.spyOn(console, m as 'log').mockImplementation(() => {}));
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  global.fetch = originalFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function render() { await act(async () => { tree = create(<AccountantPackScreen />); }); }
const pickers = () => tree!.root.findAllByType(DatePickerInput);
const days = () => pickers().map(p => toLocalISODate(p.props.value));
const pick = async (index: number, date: Date) => { await act(async () => { pickers()[index].props.onChange(date); }); };
const make = () => tree!.root.find(n => n.props.testID === 'accountant-pack-make' && typeof n.props.onPress === 'function');
const press = async () => { await act(async () => { make().props.onPress(); }); };
const hostText = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.type === 'string').map(n => [n.props.children].flat(Infinity).join(''));
const has = (id: string) => tree!.root.findAll(n => n.props.testID === id).length > 0;

it('[crit 10] opens with the last complete month in From and To, the testIDs, and the note under the button', async () => {
  await render();
  expect(pickers()).toHaveLength(2);
  expect(pickers()[0].props.label).toBe('From');
  expect(pickers()[1].props.label).toBe('To');
  expect(days()).toEqual(['2026-10-01', '2026-10-31']);
  for (const id of ['accountant-pack-from', 'accountant-pack-to', 'accountant-pack-make', 'accountant-pack-note']) expect(has(id)).toBe(true);
  expect(hostText('accountant-pack-note').join('')).toBe('The pack holds customer names, GSTINs and amounts. Send it only to your accountant.');
  expect(has('accountant-pack-problem')).toBe(false);
  expect(make().props.disabled).toBeFalsy();
});

it('[crit 10] Make pack sends the two dates once, then shares the zip with its name, as a zip', async () => {
  jest.mocked(fetch).mockResolvedValue(zipAnswer());
  await render();
  await press();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = jest.mocked(fetch).mock.calls[0];
  expect(String(url)).toBe('https://warehouse.example.test/functions/v1/generate-accountant-pack');
  expect(JSON.parse(init!.body as string)).toEqual({ from_date: '2026-10-01', to_date: '2026-10-31' });
  expect(shareFileBytes).toHaveBeenCalledTimes(1);
  expect(jest.mocked(shareFileBytes).mock.calls[0]).toEqual([ZIP_BYTES, 'riverside-accountant-pack-2026-10.zip', { mimeType: 'application/zip', UTI: 'public.zip-archive' }]);
  expect(showAlert).not.toHaveBeenCalled();
});

it('a double tap makes one pack; the button is loading meanwhile', async () => {
  let release!: (answer: unknown) => void;
  jest.mocked(fetch).mockImplementation(() => new Promise(resolve => { release = resolve; }) as never);
  await render();
  await act(async () => { make().props.onPress(); make().props.onPress(); });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(Boolean(make().props.loading)).toBe(true);
  await act(async () => { release(zipAnswer()); });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('[crit 15] a period with nothing in it: packEmpty inline, the dates kept, no share', async () => {
  jest.mocked(fetch).mockResolvedValue(refusal(404, 'NOTHING_IN_PERIOD'));
  await render();
  await pick(0, new Date(2026, 9, 5));
  await press();
  expect(hostText('accountant-pack-problem').join('')).toBe('No invoices or receipts in this period.');
  expect(days()).toEqual(['2026-10-05', '2026-10-31']);
  expect(shareFileBytes).not.toHaveBeenCalled();
  expect(showAlert).not.toHaveBeenCalled();
});

it('[crit 15] the server refuses a period across two financial years: packOneYear inline, dates kept', async () => {
  jest.mocked(fetch).mockResolvedValue(refusal(400, 'PERIOD_ACROSS_YEARS'));
  await render();
  await press();
  expect(hostText('accountant-pack-problem').join('')).toBe('Choose dates inside one financial year.');
  expect(days()).toEqual(['2026-10-01', '2026-10-31']);
});

it('dates in two financial years: the same text inline at once, the button disabled, nothing sent', async () => {
  await render();
  await pick(0, new Date(2026, 2, 15)); // 15 March 2026 is in 2025-26, To is in 2026-27
  expect(hostText('accountant-pack-problem').join('')).toBe('Choose dates inside one financial year.');
  expect(make().props.disabled).toBe(true);
  await press();
  expect(fetch).not.toHaveBeenCalled();
  await pick(0, new Date(2026, 3, 1)); // 1 April 2026 is inside 2026-27
  expect(has('accountant-pack-problem')).toBe(false);
  expect(make().props.disabled).toBeFalsy();
});

it('[crit 15] a pack too long to make (PACK_TOO_LONG): an alert titled Accountant pack with packTooLarge, dates kept', async () => {
  jest.mocked(fetch).mockResolvedValue(refusal(400, 'PACK_TOO_LONG'));
  await render();
  await press();
  expect(showAlert).toHaveBeenCalledWith('Accountant pack', 'This pack is too large. Choose a shorter period.');
  expect(days()).toEqual(['2026-10-01', '2026-10-31']);
  expect(has('accountant-pack-problem')).toBe(false);
});

it('[crit 15] a zip over the 25 MB cap (shareFileBytes refuses): the same alert, dates kept', async () => {
  jest.mocked(fetch).mockResolvedValue(zipAnswer());
  jest.mocked(shareFileBytes).mockResolvedValue({ success: false, error: t('reports.accountantPack.packTooLarge') });
  await render();
  await press();
  expect(showAlert).toHaveBeenCalledWith('Accountant pack', 'This pack is too large. Choose a shorter period.');
  expect(days()).toEqual(['2026-10-01', '2026-10-31']);
});

it('[crit 15] in Gujarati the alert and the inline texts are the spec\'s Gujarati', async () => {
  setLanguage('gu');
  jest.mocked(fetch).mockResolvedValue(refusal(400, 'PACK_TOO_LONG'));
  await render();
  await press();
  expect(showAlert).toHaveBeenCalledWith('હિસાબનીશ માટેની ફાઇલો', 'આ ફાઇલો બહુ મોટી છે. ટૂંકો સમયગાળો પસંદ કરો.');
  jest.mocked(fetch).mockResolvedValue(refusal(404, 'NOTHING_IN_PERIOD'));
  await press();
  expect(hostText('accountant-pack-problem').join('')).toBe('આ સમયગાળામાં કોઈ ઇન્વૉઇસ કે આવક નથી.');
  expect(hostText('accountant-pack-note').join('')).toBe('આ ફાઇલોમાં વેપારીઓના નામ, જીએસટીઆઈએન અને રકમ છે. ફક્ત તમારા હિસાબનીશને જ મોકલો.');
});

it('an account the server refuses (PACK_FORBIDDEN) is told the report is not available as a PDF; dates kept', async () => {
  jest.mocked(fetch).mockResolvedValue(refusal(403, 'PACK_FORBIDDEN'));
  await render();
  await press();
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showAlert).mock.calls[0][1]).toBe(t('reports.export.notAvailable'));
  expect(days()).toEqual(['2026-10-01', '2026-10-31']);
});

it('no answer from the server: the app\'s network text; any other failure: the existing failure texts; dates kept', async () => {
  jest.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'));
  await render();
  await press();
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showAlert).mock.calls[0][1]).toBe(t('errors.parsed.network'));
  jest.mocked(showAlert).mockClear();
  jest.mocked(fetch).mockResolvedValue(refusal(503, 'PACK_UNAVAILABLE'));
  await press();
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe(t('reports.export.failedTitle'));
  expect(days()).toEqual(['2026-10-01', '2026-10-31']);
});

it('a failed share (not the size cap) says the existing share failure; after any failure a second try makes a second request', async () => {
  jest.mocked(fetch).mockResolvedValue(zipAnswer());
  jest.mocked(shareFileBytes).mockResolvedValue({ success: false, error: 'Share sheet is closed.' });
  await render();
  await press();
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe(t('reports.export.shareFailedTitle'));
  await press();
  expect(fetch).toHaveBeenCalledTimes(2);
});
