/**
 * The one rule for an answer that never came (owner decision D22): wait until the phone is online and 10 s have
 * passed, ask the server about the request code, keep asking with a doubling pause while the question gets no answer.
 * Time is faked; NetInfo and the RPC call are stand-ins.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { bumpNetInfoGeneration } from '@/config/netInfoGeneration';
import {
  LOST_ANSWER_FIRST_RETRY_MS,
  LOST_ANSWER_LONGEST_RETRY_MS,
  LOST_ANSWER_MIN_WAIT_MS,
  abortedError,
  checkSubmission,
  isAbortError,
  readUntilAnswered,
  useIsDisconnected,
  waitForServer,
} from '../lostAnswer';
import { reportOutcome } from '../reportOutcome';

type NetState = { isConnected: boolean | null };
let mockState: NetState = { isConnected: true };
let mockListeners: Array<(state: NetState) => void> = [];
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: () => Promise.resolve(mockState),
    addEventListener: (listener: (state: NetState) => void) => {
      mockListeners.push(listener);
      return () => {
        mockListeners = mockListeners.filter((entry) => entry !== listener);
      };
    },
  },
}));
const mockExecuteRPC = jest.fn();
jest.mock('@/utils/serviceErrorHandler', () => ({ executeRPC: (...args: unknown[]) => mockExecuteRPC(...args) }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('../reportOutcome', () => ({ reportOutcome: jest.fn() }));

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
/** Settles with 'pending' while the promise has not settled yet. */
const state = async (promise: Promise<unknown>) => {
  let result = 'pending';
  promise.then(
    () => { result = 'resolved'; },
    (error) => { result = isAbortError(error) ? 'aborted' : 'rejected'; }
  );
  await flush();
  return result;
};

beforeEach(() => {
  jest.useFakeTimers();
  mockState = { isConnected: true };
  mockListeners = [];
  mockExecuteRPC.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('the aborted error', () => {
  it('is told by its name, and nothing else is', () => {
    expect(isAbortError(abortedError())).toBe(true);
    expect(isAbortError(new Error('Aborted'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});

describe('waitForServer', () => {
  it('waits until 10 s have passed since the request was sent', async () => {
    const wait = waitForServer(Date.now() - 4_000);
    expect(await state(wait)).toBe('pending');
    await jest.advanceTimersByTimeAsync(5_900);
    expect(await state(wait)).toBe('pending');
    await jest.advanceTimersByTimeAsync(200);
    await expect(wait).resolves.toBeUndefined();
  });

  it('does not wait when the request went out more than 10 s ago and the phone is online', async () => {
    await expect(waitForServer(Date.now() - LOST_ANSWER_MIN_WAIT_MS - 1)).resolves.toBeUndefined();
  });

  it('never waits longer than 10 s when the clock was set back (a request time in the future)', async () => {
    const wait = waitForServer(Date.now() + 3_600_000);
    await jest.advanceTimersByTimeAsync(LOST_ANSWER_MIN_WAIT_MS + 1);
    await expect(wait).resolves.toBeUndefined();
  });

  it('waits while the phone has no network, then for the 10 s as well', async () => {
    mockState = { isConnected: false };
    const wait = waitForServer(Date.now() - 60_000);
    expect(await state(wait)).toBe('pending');
    expect(mockListeners).toHaveLength(1);
    // Still offline: nothing changes.
    mockListeners[0]({ isConnected: false });
    expect(await state(wait)).toBe('pending');
    mockListeners[0]({ isConnected: true });
    await expect(wait).resolves.toBeUndefined();
    expect(mockListeners).toHaveLength(0);
  });

  it('counts an unknown reading (isConnected null) as online', async () => {
    mockState = { isConnected: null };
    await expect(waitForServer(Date.now() - 60_000)).resolves.toBeUndefined();
  });

  it('rejects with an AbortError when the signal is aborted while it waits', async () => {
    const controller = new AbortController();
    const wait = waitForServer(Date.now(), controller.signal);
    expect(await state(wait)).toBe('pending');
    controller.abort();
    expect(await state(wait)).toBe('aborted');
  });

  it('rejects at once when the signal is aborted already, and when it is aborted while offline', async () => {
    const done = new AbortController();
    done.abort();
    expect(await state(waitForServer(Date.now() - 60_000, done.signal))).toBe('aborted');

    mockState = { isConnected: false };
    const controller = new AbortController();
    const wait = waitForServer(Date.now() - 60_000, controller.signal);
    expect(await state(wait)).toBe('pending');
    controller.abort();
    expect(await state(wait)).toBe('aborted');
    expect(mockListeners).toHaveLength(0);
  });
});

// NetInfo.configure (src/config/netReachability.ts, on a change of facility) stops every listener added before it;
// the listeners here follow the generation count and subscribe again (WS-L review L4).
describe('after NetInfo was configured again', () => {
  /** What NetInfo.configure does to the listeners: they are gone, and the count tells everyone to listen again. */
  const configureAgain = () => {
    mockListeners = [];
    bumpNetInfoGeneration();
  };

  it('waitForServer listens again and still ends when the connection returns', async () => {
    mockState = { isConnected: false };
    const wait = waitForServer(Date.now() - 60_000);
    expect(await state(wait)).toBe('pending');
    expect(mockListeners).toHaveLength(1);
    configureAgain();
    await flush();
    expect(mockListeners).toHaveLength(1);
    mockListeners[0]({ isConnected: true });
    await expect(wait).resolves.toBeUndefined();
    // Nothing is left listening, to NetInfo or to the count.
    expect(mockListeners).toHaveLength(0);
    bumpNetInfoGeneration();
    expect(mockListeners).toHaveLength(0);
  });

  it('a wait that was aborted does not listen again', async () => {
    mockState = { isConnected: false };
    const controller = new AbortController();
    const wait = waitForServer(Date.now() - 60_000, controller.signal);
    expect(await state(wait)).toBe('pending');
    controller.abort();
    expect(await state(wait)).toBe('aborted');
    configureAgain();
    expect(mockListeners).toHaveLength(0);
  });

  it('useIsDisconnected listens again', async () => {
    let seen = false;
    const Probe = () => {
      seen = useIsDisconnected();
      return null;
    };
    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(Probe));
    });
    expect(mockListeners).toHaveLength(1);
    await act(async () => {
      mockListeners[0]({ isConnected: false });
    });
    expect(seen).toBe(true);
    await act(async () => {
      configureAgain();
    });
    expect(mockListeners).toHaveLength(1);
    await act(async () => {
      mockListeners[0]({ isConnected: true });
    });
    expect(seen).toBe(false);
    await act(async () => {
      tree!.unmount();
    });
    expect(mockListeners).toHaveLength(0);
  });
});

describe('readUntilAnswered', () => {
  it('returns the first answer without a pause', async () => {
    const read = jest.fn().mockResolvedValue('answer');
    await expect(readUntilAnswered(read)).resolves.toBe('answer');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('asks again after 2 s, 4 s, 8 s, 16 s, 30 s and 30 s while there is no answer', async () => {
    const read = jest.fn().mockResolvedValue(null);
    const result = readUntilAnswered(read);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
    expect(LOST_ANSWER_FIRST_RETRY_MS).toBe(2_000);

    let calls = 1;
    for (const pause of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      await jest.advanceTimersByTimeAsync(pause - 1);
      expect(read).toHaveBeenCalledTimes(calls);
      await jest.advanceTimersByTimeAsync(1);
      calls += 1;
      expect(read).toHaveBeenCalledTimes(calls);
    }
    expect(LOST_ANSWER_LONGEST_RETRY_MS).toBe(30_000);
    read.mockResolvedValue({ ok: true });
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toEqual({ ok: true });
  });

  it('takes a read that throws as no answer, and undefined as no answer', async () => {
    const read = jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined).mockResolvedValueOnce(0);
    const result = readUntilAnswered(read);
    await jest.advanceTimersByTimeAsync(2_000 + 4_000);
    await expect(result).resolves.toBe(0);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('passes an AbortError of the read on (a screen that was left)', async () => {
    const read = jest.fn().mockRejectedValue(abortedError());
    expect(await state(readUntilAnswered(read))).toBe('aborted');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('ignores the answer of a read that was in flight when the signal was aborted', async () => {
    const controller = new AbortController();
    let finish!: (value: string) => void;
    const read = jest.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const result = readUntilAnswered(read, controller.signal);
    await flush();
    controller.abort();
    finish('too late');
    expect(await state(result)).toBe('aborted');
  });

  it('stops pausing when the signal is aborted', async () => {
    const controller = new AbortController();
    const read = jest.fn().mockResolvedValue(null);
    const result = readUntilAnswered(read, controller.signal);
    await flush();
    controller.abort();
    expect(await state(result)).toBe('aborted');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('checkSubmission', () => {
  const sentLongAgo = () => Date.now() - 60_000;

  it('asks get_submission_result with the request code and returns the stored answer', async () => {
    mockExecuteRPC.mockResolvedValue({ success: true, data: { found: true, response: { success: true, id: 'x' } } });
    await expect(checkSubmission('key-1', sentLongAgo())).resolves.toEqual({ found: true, response: { success: true, id: 'x' } });
    expect(mockExecuteRPC).toHaveBeenCalledTimes(1);
    expect(mockExecuteRPC.mock.calls[0][1]).toBe('get_submission_result');
    expect(mockExecuteRPC.mock.calls[0][2]).toEqual({ p_key: 'key-1' });
  });

  it('says found: false when the server has nothing under that code', async () => {
    mockExecuteRPC.mockResolvedValue({ success: true, data: { found: false } });
    await expect(checkSubmission('key-2', sentLongAgo())).resolves.toEqual({ found: false });
  });

  it.each(['PGRST202', '42883'])('says found: false on a server without the function (%s)', async (errorCode) => {
    mockExecuteRPC.mockResolvedValue({ success: false, errorCode });
    await expect(checkSubmission('key-3', sentLongAgo())).resolves.toEqual({ found: false });
    expect(mockExecuteRPC).toHaveBeenCalledTimes(1);
  });

  it('asks again while the question itself gets no answer (a failure, or an answer of no known shape)', async () => {
    mockExecuteRPC
      .mockResolvedValueOnce({ success: false, errorCode: '', message: 'Request timeout' })
      .mockResolvedValueOnce({ success: true, data: { unexpected: true } })
      .mockResolvedValueOnce({ success: true, data: { found: false } });
    const result = checkSubmission('key-4', sentLongAgo());
    await jest.advanceTimersByTimeAsync(2_000 + 4_000);
    await expect(result).resolves.toEqual({ found: false });
    expect(mockExecuteRPC).toHaveBeenCalledTimes(3);
  });

  it('asks nothing before the 10 s are over', async () => {
    mockExecuteRPC.mockResolvedValue({ success: true, data: { found: false } });
    const result = checkSubmission('key-5', Date.now());
    await jest.advanceTimersByTimeAsync(LOST_ANSWER_MIN_WAIT_MS - 1);
    expect(mockExecuteRPC).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ found: false });
    expect(mockExecuteRPC).toHaveBeenCalledTimes(1);
  });

  it('is aborted by the signal, also during the wait', async () => {
    const controller = new AbortController();
    const result = checkSubmission('key-6', Date.now(), controller.signal);
    await flush();
    controller.abort();
    expect(await state(result)).toBe('aborted');
    expect(mockExecuteRPC).not.toHaveBeenCalled();
  });
});

describe('checkSubmission reports a settled lost answer', () => {
  const sentLongAgo = () => Date.now() - LOST_ANSWER_MIN_WAIT_MS - 1;

  beforeEach(() => (reportOutcome as jest.Mock).mockClear());

  it('once, with the request code and nothing of the answer, when the server answers', async () => {
    mockExecuteRPC.mockResolvedValue({ success: true, data: { found: true, response: { customer: 'Test Customer' } } });
    await checkSubmission('key-settled', sentLongAgo());
    expect(reportOutcome).toHaveBeenCalledTimes(1);
    expect(reportOutcome).toHaveBeenCalledWith('lost_answer_settled', { requestKey: 'key-settled' });
  });

  it('not when the wait is aborted before the server answered', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(checkSubmission('key-aborted', Date.now(), controller.signal)).rejects.toBeDefined();
    expect(reportOutcome).not.toHaveBeenCalled();
  });
});
