/**
 * cancelInvoice (backend migration 134): an invoice is cancelled, never deleted. The call sends the reason trimmed and
 * the version the page read, words each refusal by its `reason` code, and tells a lost answer apart.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { invalidateReportQueries } from '@/lib/queryClient';
import { cancelInvoice } from '../invoice-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/lib/queryClient', () => ({ invalidateReportQueries: jest.fn(async () => undefined) }));

const answer = (data: unknown) => {
  const rpc = jest.fn(async () => ({ data, error: null }));
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  return rpc;
};
const refusal = (reason: string, extra: Record<string, unknown> = {}) => ({
  success: false, error_code: 'WH409', reason, error: 'server english', message: 'server english', ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('calls cancel_invoice with the trimmed reason and the version token, and never delete_invoice', async () => {
  const rpc = answer({ success: true, cancelled_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-05T10:00:00.5Z' });

  const result = await cancelInvoice('inv-1', '  Wrong customer \u200B', '2026-10-01T09:00:00Z');

  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('cancel_invoice', {
    p_invoice_id: 'inv-1', p_reason: 'Wrong customer', p_expected_updated_at: '2026-10-01T09:00:00Z',
  });
  expect(result).toEqual({ success: true, cancelledAt: '2026-10-05T10:00:00Z', updatedAt: '2026-10-05T10:00:00.5Z' });
  expect(invalidateReportQueries).toHaveBeenCalledTimes(1);
});

it('sends null when the page has no version token (an older read)', async () => {
  const rpc = answer({ success: true });
  await cancelInvoice('inv-1', 'Duplicate');
  expect(rpc).toHaveBeenCalledWith('cancel_invoice', expect.objectContaining({ p_expected_updated_at: null }));
});

describe.each([
  ['INVOICE_CANCELLED', 'This invoice is already cancelled.'],
  ['INVOICE_HAS_PAYMENTS', 'This invoice has payments recorded against it, so it cannot be cancelled.'],
  ['CANCEL_REASON_INVALID', 'Give a reason of 3 to 500 characters.'],
  ['STALE_RECORD', 'Someone else changed this invoice. It has been loaded again: check it, then cancel it if it is still wrong.'],
])('the refusal %s', (reason, text) => {
  it('is worded by the app from the code, not from the server sentence', async () => {
    answer(refusal(reason));
    const result = await cancelInvoice('inv-1', 'Duplicate');
    expect(result.success).toBe(false);
    expect(result.reason).toBe(reason);
    expect(result.message).toBe(text);
    expect(JSON.stringify(result.message)).not.toContain('server english');
  });
});

describe('INVOICE_HAS_PAYMENTS names the invoice (WH-170 item 2)', () => {
  it('shows the full prefixed number of a facility with a prefix', async () => {
    answer(refusal('INVOICE_HAS_PAYMENTS', { inv_no: 12, invoice_label: 'SRT/12' }));
    const result = await cancelInvoice('inv-1', 'Duplicate');
    expect(result.message).toBe('Invoice SRT/12 has payments recorded. Delete them first.');
  });

  it('shows the digits when the server sends no label (before migration 175)', async () => {
    answer(refusal('INVOICE_HAS_PAYMENTS', { inv_no: 12 }));
    const result = await cancelInvoice('inv-1', 'Duplicate');
    expect(result.message).toBe('Invoice 12 has payments recorded. Delete them first.');
  });
});

it('leaves the reports alone after a refusal that changed nothing', async () => {
  answer(refusal('INVOICE_HAS_PAYMENTS'));
  await cancelInvoice('inv-1', 'Duplicate');
  expect(invalidateReportQueries).not.toHaveBeenCalled();
});

it('reports "Invoice not found" as NOT_FOUND', async () => {
  answer({ success: false, error: 'Invoice not found' });
  const result = await cancelInvoice('inv-1', 'Duplicate');
  expect(result).toMatchObject({ success: false, reason: 'NOT_FOUND', message: 'This invoice is not there any more.' });
});

it('says "Couldn\'t cancel the invoice. Try again." for a failure the app has no wording for, hiding the server sentence', async () => {
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({
    rpc: jest.fn(async () => ({ data: null, error: { message: 'relation "invoice_x" is on fire', code: 'XX000' }, status: 500 })),
  });
  const result = await cancelInvoice('inv-1', 'Duplicate');
  expect(result.success).toBe(false);
  expect(result.message).toBe("Couldn't cancel the invoice. Try again.");
  expect(JSON.stringify(result)).not.toContain('"message":"relation');
});

it('is a lost answer when no answer came and the request may have been sent', async () => {
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({
    rpc: jest.fn(async () => ({ data: null, error: { message: 'Bad Gateway', code: '' }, status: 502 })),
  });
  const result = await cancelInvoice('inv-1', 'Duplicate');
  expect(result.success).toBe(false);
  expect(result.lostAnswer).toBe(true);
  expect(result.message).toBeUndefined();
});
