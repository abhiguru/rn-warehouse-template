/**
 * A stand-in for the facility's Supabase `rpc`, for the invoice flow tests: it answers every call the invoice
 * screens make, by name, in the shape the real functions answer, from a few GRNs and one saved invoice. Every call is
 * recorded. A test can replace one answer (`on`), make a name wait (`hold`) or refuse (`fail`).
 *
 * Fictional data only. No jest globals here.
 */
import { IDS, invoiceHeader, invoiceableGrn } from '@/tests/helpers/invoiceFixtures';
import type { InvoiceHeaderData, InvoiceItemData, InvoiceableGrn } from '@/types/invoice.types';

export interface RpcAnswer {
  data: unknown;
  error: { message: string; code?: string } | null;
}
export interface RpcCall {
  name: string;
  args: any;
}
type Handler = (args: any, call: RpcCall) => RpcAnswer | Promise<RpcAnswer>;

export interface FlowGrn {
  summary: InvoiceableGrn;
  lines: InvoiceItemData[];
}

/** One line as `generate_invoice_data_for_grn_with_pricing` lists it. */
export const previewRow = (line: InvoiceItemData) => ({
  grn_items_id: line.grn_item_id,
  grn_items_item_id: line.item_id,
  grn_items_item_name: line.item_name,
  dispatches_items_disp_qty: line.qty,
  grn_items_original_qty: line.grn_original_qty,
  grn_items_package_mark: line.package_mark,
  grn_items_rack: line.rack,
  grn_items_weight: line.weight,
  dispatches_id: line.dispatch_id,
  dispatches_no: line.dispatch_no,
  dispatches_date: line.dispatch_date,
  dispatches_items_id: line.disp_trl_id,
  grn_id: line.grn_id,
  grn_no: line.grn_no,
  grn_date: line.grn_date,
  duration: line.duration,
  no_of_days: line.no_of_days,
  unit_price: line.charge,
  labour_rate: line.labour_rate,
  tax_percent: line.tax,
  grn_items_pricing_mode: line.one_time ? 'ONE_TIME' : 'MONTHLY',
});

/** One line as `get_invoice_detail` lists it. */
export const detailRow = (line: InvoiceItemData, index: number) => ({
  id: String(index),
  disp_trl_id: line.disp_trl_id,
  grn_item_id: line.grn_item_id,
  item_id: line.item_id,
  item_name: line.item_name,
  qty: line.qty,
  grn_original_qty: line.grn_original_qty,
  package_mark: line.package_mark,
  rack: line.rack,
  weight: line.weight,
  dispatch_id: line.dispatch_id,
  dispatch_no: line.dispatch_no,
  dispatch_date: line.dispatch_date,
  duration: line.duration,
  no_of_days: line.no_of_days,
  charge: line.charge,
  labour_rate: line.labour_rate,
  tax: line.tax,
});

export interface Deferred {
  /** Lets the held calls answer. */
  release: () => void;
}

export interface FlowServer {
  /** The function behind `getAuthenticatedClient().rpc`. */
  rpc: (name: string, args?: any) => Promise<RpcAnswer>;
  calls: RpcCall[];
  callsOf: (name: string) => RpcCall[];
  /** The next number `get_next_invoice_number` answers with. */
  nextNumber: number;
  /** GRNs by id; add with `addGrn`. */
  grns: Record<string, FlowGrn>;
  addGrn: (id: string, grNo: string, lines: InvoiceItemData[], summary?: Partial<InvoiceableGrn>) => FlowGrn;
  /** The saved invoice an edit opens. */
  setInvoice: (items: InvoiceItemData[], header?: Partial<InvoiceHeaderData>) => void;
  /** Makes asking for this GRN's lines fail with an error. */
  failGrnLoad: (id: string, message: string) => void;
  /** Replaces the answer to `name` for the calls after this one. */
  on: (name: string, handler: Handler) => void;
  /** Makes calls of `name` wait until the returned `release()`. */
  hold: (name: string) => Deferred;
  /** Makes `name` answer with an error. */
  fail: (name: string, message: string) => void;
  /** Clears `on`, `hold` and `fail` for `name`. */
  restore: (name: string) => void;
}

const ok = (data: unknown): RpcAnswer => ({ data, error: null });

/** Strips the backslashes `escapeLike` puts before wildcard characters. */
const unescapeLike = (text: string) => text.replace(/\\([\\%_])/g, '$1');

export function makeFlowServer(): FlowServer {
  const calls: RpcCall[] = [];
  const overrides = new Map<string, Handler>();
  const holds = new Map<string, Promise<void>>();
  const failingGrns = new Map<string, string>();
  const grns: Record<string, FlowGrn> = {};
  let invoice: { header: InvoiceHeaderData; items: InvoiceItemData[]; pricingMode: string } | null = null;

  const server: FlowServer = {
    calls,
    callsOf: (name) => calls.filter((call) => call.name === name),
    nextNumber: 55,
    grns,
    addGrn: (id, grNo, lines, summary = {}) => {
      const grn = {
        summary: invoiceableGrn({
          id,
          gr_no: grNo,
          total_dispatched_qty: lines.reduce((sum, line) => sum + line.qty, 0),
          ...summary,
        }),
        lines: lines.map((line) => ({ ...line, grn_id: id, grn_no: grNo })),
      };
      grns[id] = grn;
      return grn;
    },
    setInvoice: (items, header = {}) => {
      invoice = { header: invoiceHeader(header), items, pricingMode: items.every((line) => line.one_time) ? 'ONE_TIME' : 'MONTHLY' };
    },
    failGrnLoad: (id, message) => { failingGrns.set(id, message); },
    on: (name, handler) => { overrides.set(name, handler); },
    hold: (name) => {
      let release!: () => void;
      holds.set(name, new Promise<void>((resolve) => { release = resolve; }));
      return { release: () => { holds.delete(name); release(); } };
    },
    fail: (name, message) => { overrides.set(name, () => ({ data: null, error: { message } })); },
    restore: (name) => { overrides.delete(name); holds.delete(name); },
    rpc: async (name, args) => {
      const call = { name, args };
      calls.push(call);
      const held = holds.get(name);
      if (held) await held;
      const override = overrides.get(name);
      if (override) return override(args, call);
      return answer(name, args);
    },
  };

  const answer = (name: string, args: any): RpcAnswer => {
    switch (name) {
      case 'get_next_invoice_number':
        return ok(String(server.nextNumber++));
      case 'get_invoiceable_grns': {
        const search = args?.p_search_grn_no ? unescapeLike(String(args.p_search_grn_no)).toLowerCase() : '';
        const found = Object.entries(grns)
          .filter(([, grn]) => !search || grn.summary.gr_no.toLowerCase().includes(search))
          .map(([id, grn]) => ({
            grn_id: id,
            gr_no: grn.summary.gr_no,
            gr_date: grn.summary.date,
            customer_id: grn.summary.customer_id,
            customer_name: grn.summary.customer_name,
            total_dispatched_qty: grn.summary.total_dispatched_qty,
            has_uninvoiced_items: true,
          }));
        return ok(found);
      }
      case 'generate_invoice_data_for_grn_with_pricing': {
        const grn = grns[args.p_gr_id];
        if (failingGrns.has(args.p_gr_id)) return { data: null, error: { message: failingGrns.get(args.p_gr_id)! } };
        if (!grn) return ok({ success: false, error: 'GRN not found' });
        return ok({
          success: true,
          header: {
            customer_id: grn.summary.customer_id,
            customer_name: grn.summary.customer_name,
            grn_id: args.p_gr_id,
            grn_no: grn.summary.gr_no,
          },
          items: grn.lines.map(previewRow),
        });
      }
      case 'save_invoice': {
        const data = args.p_invoice_data;
        return ok({ success: true, invoice_id: 'new-1', invoice_no: data.inv_no, totals: { grand_total: data.total } });
      }
      case 'get_invoice_detail': {
        if (!invoice) return ok({ success: false, error: 'Invoice not found' });
        return ok({
          success: true,
          invoice: { ...invoice.header, inv_no: invoice.header.inv_no, pricing_mode: invoice.pricingMode },
          items: invoice.items.map(detailRow),
        });
      }
      case 'get_invoice_data':
        return ok({ success: true, data: { header: { grn: { pricing_mode: invoice?.pricingMode ?? 'MONTHLY' } } } });
      case 'update_invoice': {
        const data = args.p_invoice_data;
        if (invoice) invoice.header = { ...invoice.header, total: data.total, discount: data.discount, inv_no: data.inv_no };
        return ok({ success: true, invoice_id: args.p_invoice_id, invoice_number: String(data.inv_no), message: 'Updated' });
      }
      default:
        return { data: null, error: { message: `Unexpected rpc ${name}` } };
    }
  };

  return server;
}

export { IDS };
