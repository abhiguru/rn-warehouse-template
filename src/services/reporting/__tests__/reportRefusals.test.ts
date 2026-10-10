/**
 * A report RPC answers HTTP 200 with the refusal in the body: access denied, or
 * the function's own exception handler. Every reporting service must report
 * that as a failure, never as a report with nothing in it.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import { getCustomerStockSummary, getAllStockSummary } from '../stock-summary-service';
import { getCustomerDispatchActivity, getAllDispatchActivity } from '../dispatch-activity-service';
import { getOperationsDashboard } from '../operations-dashboard-service';
import { getCustomerStockAging, getAllStockAging } from '../stock-aging-service';
import { getCustomerGRNActivity, getAllGRNActivity } from '../grn-activity-service';
import { getCustomerInvoiceHistory, getAllInvoiceHistory } from '../invoice-history-service';
import { getAllCustomerActivity, getCustomerActivityDetail } from '../customer-activity-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getStoredToken: jest.fn(async () => ({ isValid: true, type: 'custom', authToken: 'x' })),
}));

const CUSTOMER = 'cccccccc-1111-4222-8333-444444444444';
const RANGE = { fromDate: '2026-10-01', toDate: '2026-10-11' };

const rpc = jest.fn();
let logged: jest.SpyInstance;

function answer(data: unknown) {
  rpc.mockResolvedValue({ data, error: null });
}

type Call = () => Promise<{ success: boolean; message?: string; error?: string; data?: unknown }>;

/** [what the test is called, the RPC it must reach, the call] */
const calls: [string, string, Call][] = [
  ['customer stock summary', 'get_customer_stock_summary', () => getCustomerStockSummary(CUSTOMER)],
  ['all stock summary', 'get_all_stock_summary', () => getAllStockSummary()],
  ['customer dispatch activity', 'get_customer_dispatch_activity', () => getCustomerDispatchActivity({ customerId: CUSTOMER, ...RANGE })],
  ['all dispatch activity', 'get_all_dispatch_activity', () => getAllDispatchActivity(RANGE)],
  ['customer stock aging', 'get_stock_aging_report', () => getCustomerStockAging({ customerId: CUSTOMER })],
  ['all stock aging', 'get_stock_aging_report', () => getAllStockAging()],
  ['customer GRN activity', 'get_customer_grn_activity', () => getCustomerGRNActivity({ customerId: CUSTOMER, ...RANGE })],
  ['all GRN activity', 'get_all_grn_activity', () => getAllGRNActivity(RANGE)],
  ['customer invoice history', 'get_customer_invoice_summary', () => getCustomerInvoiceHistory({ customerId: CUSTOMER, ...RANGE })],
  ['all invoice history', 'get_customer_invoice_summary', () => getAllInvoiceHistory(RANGE)],
  ['all customer activity', 'get_all_customer_activity_summary', () => getAllCustomerActivity(RANGE)],
  ['customer activity detail', 'get_customer_activity_detail', () => getCustomerActivityDetail({ customerId: CUSTOMER, ...RANGE })],
];

beforeEach(() => {
  jest.clearAllMocks();
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  logged = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  setLanguage('en');
});

describe.each(calls)('%s', (_label, name, call) => {
  it('calls the RPC it is named for', async () => {
    answer({ success: true, data: {} });
    await call();
    expect(rpc.mock.calls[0][0]).toBe(name);
  });

  it('reports {success:false, error} as a failure with the server text', async () => {
    answer({
      success: false,
      error: "Access denied: You do not have permission to view this customer's data",
      error_code: '42501',
    });
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.message).toBe("Access denied: You do not have permission to view this customer's data");
    expect(result.error).toBe('42501');
  });

  it('reports a denial that has no success key ({error, summary:null})', async () => {
    answer({ error: 'Access denied: customer not accessible', summary: null });
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.message).toBe('Access denied: customer not accessible');
  });

  it('reads the refusal out of a one-row array', async () => {
    answer([{ success: false, message: 'Failed to retrieve report: Customer access denied' }]);
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to retrieve report: Customer access denied');
  });

  it('shows the reason in Gujarati, not the English sentence', async () => {
    setLanguage('gu');
    answer({ success: false, error: 'Access denied: customer not accessible' });
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.message).toBe(t('errors.parsed.noPermission'));
  });

  it('does not log the answer or the request', async () => {
    answer({ success: true, data: { summary: {}, customers: [{ customer_name: 'Example Traders' }] } });
    await call();
    expect(logged).not.toHaveBeenCalled();
  });

  it('still answers success for a body that is not a refusal', async () => {
    answer({ success: true, data: { summary: {} }, summary: {} });
    const result = await call();
    expect(result.success).toBe(true);
  });
});

describe('Operations Dashboard', () => {
  it('names a role denial in the body STAFF_ONLY', async () => {
    answer({
      error: 'Access denied: admin or supervisor role required',
      kpis: null,
      trends: null,
      recent_activity: [],
    });
    const result = await getOperationsDashboard(RANGE);
    expect(result).toMatchObject({
      success: false,
      error: 'STAFF_ONLY',
      message: t('reports.operations.service.accessDenied'),
    });
  });

  it('reads a report when the body is one', async () => {
    answer({ kpis: { total_grns: 4 }, trends: {}, recent_activity: [] });
    const result = await getOperationsDashboard(RANGE);
    expect(result.success).toBe(true);
    expect(result.data?.kpis.total_grns).toBe(4);
  });

  it('does not call a server failure a role denial', async () => {
    answer({ success: false, error: 'Failed to retrieve dashboard: division by zero', error_code: '22012' });
    const result = await getOperationsDashboard(RANGE);
    expect(result.success).toBe(false);
    expect(result.error).toBe('22012');
    expect(result.message).toBe('Failed to retrieve dashboard: division by zero');
  });
});

describe('the days a report asks for', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(2026, 9, 11, 1, 30)));
  afterEach(() => jest.useRealTimers());

  it('"last N days" includes today, as on the period selector (M3-7)', async () => {
    answer({ success: true, data: {} });
    await getAllCustomerActivity({ daysBack: 120 });
    // 11 Oct back to 14 Jun is 120 days.
    expect(rpc.mock.calls[0][1]).toEqual({ p_from_date: '2026-06-14', p_to_date: '2026-10-11' });
  });

  it('are the phone calendar days, also in the small hours', async () => {
    answer({ success: true, data: {} });
    await getOperationsDashboard({ daysBack: 1 });
    expect(rpc.mock.calls[0][1]).toEqual({ p_from_date: '2026-10-11', p_to_date: '2026-10-11' });
  });
});
