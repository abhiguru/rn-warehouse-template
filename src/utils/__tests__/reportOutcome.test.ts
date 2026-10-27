import { markRefusal, reportOutcome, reportSaveError, type OutcomeDetail, type OutcomeKind } from '../reportOutcome';

// The SDK is stood in for (the real one starts an interval that keeps Jest open); sentryConfig itself, with the real
// redaction, is what runs, and what it hands the SDK is what is checked.
const mockCaptureMessage = jest.fn();
jest.mock('@sentry/react-native', () => ({ captureMessage: (...args: unknown[]) => mockCaptureMessage(...args) }));
const mockConnectionPath = jest.fn(() => 'public');
jest.mock('@/config/lanTransport', () => ({ getConnectionPath: () => mockConnectionPath() }));

const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
beforeEach(() => {
  mockCaptureMessage.mockReset();
  mockConnectionPath.mockReturnValue('public');
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@errors.example.org/1';
});
afterAll(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
});

describe('reportOutcome', () => {
  // The 64 hex digits of the hash are written in groups of eight so that the token redaction leaves them alone.
  const SPREAD_KEY = `warehouse-grn-${Array(4).fill('01234567.89abcdef').join('.')}`;
  const full: OutcomeDetail = { requestKey: `warehouse-grn-${'0123456789abcdef'.repeat(4)}`, code: 'STALE_RECORD', path: 'lan', httpStatus: 409 };

  it.each<[OutcomeKind, string]>([
    ['save_refused', 'info'],
    ['lost_answer', 'warning'],
    ['lost_answer_settled', 'info'],
    ['save_failed', 'warning'],
  ])('sends one line and the level for %s', (kind, level) => {
    reportOutcome(kind, full);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      `outcome ${kind} code=STALE_RECORD path=lan http=409 key=${SPREAD_KEY}`,
      level
    );
  });

  it('sends the request key whole, however long, and cuts only the code', () => {
    const key = `warehouse-grn-${'0123456789abcdef'.repeat(4)}`;
    reportOutcome('save_failed', { requestKey: key, path: 'public' });
    expect(mockCaptureMessage).toHaveBeenCalledWith(`outcome save_failed path=public key=${SPREAD_KEY}`, 'warning');
    expect(key.length).toBeGreaterThan(64);
    // Removing the dots gives the key back whole.
    const sent = (mockCaptureMessage.mock.calls[0][0] as string).split('key=')[1];
    expect(sent.replace(/\./g, '')).toBe(key);
  });

  it('leaves out what is not known, and takes the current path when none is given', () => {
    mockConnectionPath.mockReturnValue('lan');
    reportOutcome('save_failed');
    expect(mockCaptureMessage).toHaveBeenCalledWith('outcome save_failed path=lan', 'warning');
  });

  it('redacts a phone number, an e-mail address and a token inside the code', () => {
    reportOutcome('save_refused', {
      code: 'duplicate 9876543210 a@b.example Bearer abc.def-ghi',
      path: 'public',
    });
    const [message] = mockCaptureMessage.mock.calls[0] as [string, string];
    expect(message).not.toMatch(/9876543210/);
    expect(message).not.toMatch(/a@b\.example/);
    expect(message).not.toMatch(/abc\.def-ghi/);
    expect(message).toContain('[REDACTED_PHONE]');
  });

  it('keeps a long or odd code to 64 plain characters', () => {
    reportOutcome('save_refused', { code: `Name: Ramesh Patel ${'x'.repeat(200)}`, path: 'public' });
    const [message] = mockCaptureMessage.mock.calls[0] as [string, string];
    const code = /code=(\S*)/.exec(message)?.[1] ?? '';
    expect(code.length).toBeLessThanOrEqual(64);
    expect(code).toMatch(/^[A-Za-z0-9_.:\-[\]]+$/);
  });

  it('sends nothing but the named fields', () => {
    reportOutcome('save_refused', { ...full, body: { customer: 'Ramesh Patel' }, name: 'Ramesh Patel' } as OutcomeDetail);
    const [message] = mockCaptureMessage.mock.calls[0] as [string, string];
    expect(message).not.toMatch(/Ramesh|customer|body/);
  });

  it('sends nothing without a DSN', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    reportOutcome('save_refused', full);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('never throws when reporting fails', () => {
    mockCaptureMessage.mockImplementation(() => {
      throw new Error('sdk down');
    });
    expect(() => reportOutcome('lost_answer', full)).not.toThrow();
  });
});

describe('reportSaveError', () => {
  it('reports a lost answer with the request code', () => {
    reportSaveError(new Error('timeout'), { lost: true, requestKey: 'k-1' });
    expect(mockCaptureMessage).toHaveBeenCalledWith('outcome lost_answer path=public key=k-1', 'warning');
  });

  it('reports an error named as a refusal as save_refused, with its code', () => {
    const refusal = Object.assign(new Error('Ramesh Patel owes 5000'), { name: 'RateRefusal', code: 'STALE_RATES' });
    reportSaveError(refusal);
    expect(mockCaptureMessage).toHaveBeenCalledWith('outcome save_refused code=STALE_RATES path=public', 'info');
  });

  it('takes the reason of a server refusal as the code', () => {
    reportSaveError(Object.assign(new Error('x'), { name: 'ServerRefusalError', refusal: { reason: 'GRN_HAS_STOCK' } }));
    expect(mockCaptureMessage).toHaveBeenCalledWith('outcome save_refused code=GRN_HAS_STOCK path=public', 'info');
  });

  it('reports an error marked as a refusal, and one of the named classes, as save_refused', () => {
    reportSaveError(markRefusal(new Error('Ramesh Patel is over the limit'), 'NUMBER_TAKEN'));
    reportSaveError(Object.assign(new Error('x'), { name: 'PossibleDuplicateRefusal' }));
    expect(mockCaptureMessage.mock.calls.map(([text]) => text)).toEqual([
      'outcome save_refused code=NUMBER_TAKEN path=public',
      'outcome save_refused path=public',
    ]);
  });

  it('does not treat an error merely named like a refusal by its message as one', () => {
    reportSaveError(new Error('Refusal of service'));
    expect(mockCaptureMessage).toHaveBeenCalledWith('outcome save_failed path=public', 'warning');
  });

  it('reports any other error as save_failed and never sends its message', () => {
    reportSaveError(new Error('insert failed for customer Ramesh Patel 9876543210'));
    expect(mockCaptureMessage).toHaveBeenCalledWith('outcome save_failed path=public', 'warning');
  });

  it('accepts a thrown value that is not an error', () => {
    expect(() => reportSaveError(undefined)).not.toThrow();
    expect(mockCaptureMessage).toHaveBeenCalledWith('outcome save_failed path=public', 'warning');
  });
});
