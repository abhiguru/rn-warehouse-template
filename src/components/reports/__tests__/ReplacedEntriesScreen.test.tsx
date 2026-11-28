/**
 * WH-303: the Replaced entries report (Design offline-capture.md 6.3; administrators only). The real screen, the real
 * service (`getReplacedEntries`, only the facility's answer is faked), the real sentence helper and translations. The
 * router, the theme store and the phone's connection flag are the stand-ins.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage, t as tr } from '@/i18n';
import ReplacedEntriesScreen from '../../../../app/reports/replaced-entries';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: { preference: 'light', brand: 'orange' } }),
}));
let mockOffline = false;
jest.mock('@/features/phone-copy/useNeedsConnection', () => ({
  useNeedsConnection: () => mockOffline,
  needsConnectionLabel: (label: string) => label,
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

const rpc = jest.fn();
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `e${n}`,
  grn_id: `g${n}`,
  gr_no: `B${n}`,
  customer_name: 'Fictional Traders',
  kind: 'field',
  field: 'rack',
  newer_value: 'D-5',
  newer_by_name: 'Meena Fictional',
  newer_at: '2026-11-26T16:15:00+05:30',
  sent_value: 'C-2',
  sent_by_name: 'Ravi Fictional',
  sent_at: '2026-11-26T16:20:00+05:30',
  recorded_at: null,
  checked_at: null,
  checked_by_name: null,
  ...over,
});

beforeEach(() => {
  mockOffline = false;
  rpc.mockReset();
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
});
afterEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
});

describe('Replaced entries report', () => {
  it('asks the server for the last 120 days and lists each entry with its GRN, customer, sentence and state', async () => {
    rpc.mockResolvedValue({
      data: { success: true, total: 2, rows: [row(1), row(2, { checked_at: '2026-11-27T10:00:00+05:30', checked_by_name: 'Asha Fictional' })] },
      error: null,
    });
    await render(<ReplacedEntriesScreen />);

    expect(await screen.findByText('GRN B1 · Rack')).toBeOnTheScreen();
    expect(screen.getByText('GRN B2 · Rack')).toBeOnTheScreen();
    expect(screen.getAllByText('Fictional Traders')).toHaveLength(2);
    // The day shown depends on today's date (the sentence helper's own tests fix the clock), so the times are matched loosely.
    expect(screen.getAllByText(/^Rack: D-5 \(Meena Fictional, .*4:15 pm\) was replaced by C-2 \(Ravi Fictional, .*4:20 pm\)\.$/)).toHaveLength(2);
    expect(screen.getByTestId('replaced-entry-tag-e1')).toHaveTextContent('To check');
    expect(screen.getByTestId('replaced-entry-tag-e2')).toHaveTextContent('Checked');

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, { p_from: string; p_to: string; p_state: unknown }];
    expect(name).toBe('get_grn_replacements');
    const days = (Date.parse(args.p_to) - Date.parse(args.p_from)) / 86_400_000;
    expect(days).toBe(120);
    expect(args.p_state).toBeNull();
  });

  it('opens the GRN when an entry is tapped', async () => {
    rpc.mockResolvedValue({ data: { success: true, total: 1, rows: [row(1)] }, error: null });
    await render(<ReplacedEntriesScreen />);
    await userEvent.press(await screen.findByTestId('replaced-entry-e1'));
    expect(mockPush).toHaveBeenCalledWith('/grn-details/g1');
  });

  it('says there are none for the period when the list is empty, with no generic subtitle (EN)', async () => {
    rpc.mockResolvedValue({ data: { success: true, total: 0, rows: [] }, error: null });
    await render(<ReplacedEntriesScreen />);
    expect(await screen.findByText('No replaced entries in this period')).toBeOnTheScreen();
    expect(screen.getByTestId('replaced-entries-empty')).toHaveTextContent(/^No replaced entries in this period$/);
    expect(screen.queryByText(tr('lists.empty.subtitle'))).not.toBeOnTheScreen();
  });

  it('says there are none for the period when the list is empty, with no generic subtitle (GU)', async () => {
    setLanguage('gu');
    rpc.mockResolvedValue({ data: { success: true, total: 0, rows: [] }, error: null });
    await render(<ReplacedEntriesScreen />);
    expect(await screen.findByText('આ સમયગાળામાં કોઈ એન્ટ્રી બદલાઈ નથી')).toBeOnTheScreen();
    expect(screen.getByTestId('replaced-entries-empty')).toHaveTextContent(/^આ સમયગાળામાં કોઈ એન્ટ્રી બદલાઈ નથી$/);
    expect(screen.queryByText(tr('lists.empty.subtitle'))).not.toBeOnTheScreen();
  });

  it('says to check the connection when the server does not answer, and Try again asks once more', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('network') });
    rpc.mockResolvedValueOnce({ data: { success: true, total: 1, rows: [row(1)] }, error: null });
    await render(<ReplacedEntriesScreen />);
    expect(await screen.findByText('Check your connection and try again.', { exact: false })).toBeOnTheScreen();
    expect(screen.queryByText('GRN B1 · Rack')).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: /retry|try again/i }));

    expect(await screen.findByText('GRN B1 · Rack')).toBeOnTheScreen();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('with no connection it says so, asks the server nothing and offers no Try again', async () => {
    mockOffline = true;
    await render(<ReplacedEntriesScreen />);
    expect(screen.getByTestId('replaced-entries-needs-connection')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /retry|try again/i })).not.toBeOnTheScreen();
    expect(rpc).not.toHaveBeenCalled();
  });
});
