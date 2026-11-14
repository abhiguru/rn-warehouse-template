/**
 * WH-205 rework 2: `prepareInvoiceFromGrn(..., stillWanted)` asks `stillWanted` before each of its two writes to the form
 * slice (the GRN's preview, then the suggested number). When it says no the result is `{ ok: false, stale: true }` and that
 * write does not happen; without `stillWanted` the call behaves as before. The real service and the real invoice-form slice
 * run; only the facility's `rpc` answers. Fictional data only.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { prepareInvoiceFromGrn } from '@/features/invoice/utils/prepareInvoiceFromGrn';
import { makeInvoiceStore, IDS, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/store/hooks', () => ({}));

let server: FlowServer;
let store: ReturnType<typeof makeInvoiceStore>;
const types = () => (store.dispatch as unknown as jest.Mock).mock.calls.map(([action]) => (action as { type: string }).type);
const run = (stillWanted?: () => boolean) =>
  prepareInvoiceFromGrn(store.dispatch, store.getState as never, IDS.grn, stillWanted);

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  server = makeFlowServer();
  server.addGrn(IDS.grn, 'A0010', [invoiceLine()]);
  store = makeInvoiceStore({ role: 'admin' });
  jest.spyOn(store, 'dispatch');
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: server.rpc } as never);
});
afterEach(() => jest.restoreAllMocks());

describe('prepareInvoiceFromGrn with stillWanted', () => {
  it('says no before the first write: stale, and nothing is written to the form', async () => {
    const before = store.getState().invoiceForm;
    const result = await run(() => false);

    expect(result).toEqual({ ok: false, message: '', stale: true });
    expect(types()).toEqual([]);
    expect(store.getState().invoiceForm).toEqual(before);
  });

  it('says no before the second write (the suggested number): stale, and the number is not written', async () => {
    let asked = 0;
    const result = await run(() => ++asked < 2);

    expect(asked).toBe(2);
    expect(result).toEqual({ ok: false, message: '', stale: true });
    expect(types().filter((type) => type === 'invoiceForm/updateHeader')).toEqual([]);
    expect(store.getState().invoiceForm.header.inv_no).toBe(0);
  });

  it('without stillWanted it behaves as before: both writes, and the form opens at Review', async () => {
    const result = await run();

    expect(result.ok).toBe(true);
    expect(types()).toEqual(expect.arrayContaining(['invoiceForm/loadInvoiceFormData', 'invoiceForm/updateHeader']));
    expect(store.getState().invoiceForm.header.inv_no).toBe(55);
    expect(store.getState().invoiceForm.items).toHaveLength(1);
  });

  it('with stillWanted always true it gives the same result as without', async () => {
    const result = await run(() => true);

    expect(result.ok).toBe(true);
    expect(store.getState().invoiceForm.header.inv_no).toBe(55);
  });
});
