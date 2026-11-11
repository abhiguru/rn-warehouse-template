/**
 * get_connection_history (WH-177, migration 188): rows are read defensively, a missing function is worded as "needs an update".
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getConnectionHistory } from '../connectionHistoryService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const answer = (data: unknown, error: unknown = null, status = 200) => {
  const rpc = jest.fn(async () => ({ data, error, status }));
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  return rpc;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('maps the rows, reads numbers sent as text, and turns negative or odd values into 0', async () => {
  const rpc = answer({
    success: true,
    days: [
      { day: '2026-11-12', gaps: 3, longest_s: '120', total_s: 300, phones: 2, saves_tried: 5, lost_answers: 1 },
      { day: '2026-11-11', gaps: -1, longest_s: 'x', total_s: null, phones: undefined, saves_tried: '', lost_answers: 0 },
    ],
  });
  const days = await getConnectionHistory();
  expect(rpc).toHaveBeenCalledWith('get_connection_history', {});
  expect(days).toEqual([
    { day: '2026-11-12', gaps: 3, longestS: 120, totalS: 300, phones: 2, savesTried: 5, lostAnswers: 1 },
    { day: '2026-11-11', gaps: 0, longestS: 0, totalS: 0, phones: 0, savesTried: 0, lostAnswers: 0 },
  ]);
});

it('drops a row without a proper day, and a row that is not an object', async () => {
  answer({ success: true, days: [null, 'x', { day: '12/11/2026', gaps: 1 }, { gaps: 1 }, { day: '2026-11-10', gaps: 1 }] });
  const days = await getConnectionHistory();
  expect(days.map(d => d.day)).toEqual(['2026-11-10']);
});

it('says the load failed when days is not a list', async () => {
  answer({ success: true, days: 'nope' });
  await expect(getConnectionHistory()).rejects.toThrow('Could not load the connection history.');
});

it('says the server needs an update when the function is missing', async () => {
  answer(null, { message: 'Could not find the function', code: 'PGRST202' }, 404);
  await expect(getConnectionHistory()).rejects.toThrow('This server needs an update before it can show the connection history.');
});
