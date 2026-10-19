/**
 * Fixtures for the invoice form tests: lines, headers, a store and the store
 * hooks the screens read through. Fictional names and numbers only.
 *
 * No jest globals here, so a test can call this from a `jest.mock` factory
 * (`require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore)`).
 */
import { useSyncExternalStore } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import invoiceFormReducer, {
  loadInvoiceEditData,
  loadInvoiceFormData,
  resetForm,
} from '@/store/slices/invoiceFormSlice';
import { calculateItemAmounts } from '@/utils/invoiceCalculations';
import type {
  InvoiceableGrn,
  InvoiceHeaderData,
  InvoiceItemData,
} from '@/types/invoice.types';

export const IDS = {
  invoice: 'inv-42',
  grn: '11111111-2222-4333-8444-555555555555',
  otherGrn: '11111111-2222-4333-8444-666666666666',
  customer: '22222222-3333-4444-8555-666666666666',
  item: 'i1',
} as const;

/** A dispatch line id that is a valid uuid and differs per `n`. */
const lineId = (n: number) => `${String(n + 1).padStart(8, 'a')}-2222-4333-8444-555555555555`;

/**
 * A line of an invoice as the edit form loads it. `n` makes its ids differ from
 * those of the other lines; its amounts follow from its quantity and rates.
 */
export function invoiceLine(overrides: Partial<InvoiceItemData> = {}, n = 0): InvoiceItemData {
  const base: InvoiceItemData = {
    temp_id: `edit_${n}_0`,
    disp_trl_id: lineId(n),
    grn_item_id: `g${n + 1}`,
    item_id: IDS.item,
    item_name: 'Example Potatoes',
    qty: 100,
    grn_original_qty: 100,
    package_mark: 'M1',
    rack: '',
    weight: 50,
    dispatch_id: `d${n + 1}`,
    dispatch_no: `I000${n + 1}`,
    dispatch_date: '2026-10-01',
    grn_id: IDS.grn,
    grn_no: 'A0010',
    grn_date: '2026-09-01',
    duration: 1,
    no_of_days: 30,
    charge: 5,
    labour_rate: 2,
    tax: 5,
    amount: 0,
    labour_amount: 0,
    tax_amount: 0,
    item_total: 0,
  };
  const line = { ...base, ...overrides };
  const amounts = calculateItemAmounts(line.qty, line.charge, line.labour_rate, line.tax, line.duration, line.one_time);
  return { ...line, amount: amounts.amount, labour_amount: amounts.labour_amount, tax_amount: amounts.tax_amount, item_total: amounts.item_total };
}

/** Several lines of one item group (same item and mark), each a different dispatch. */
export function groupLines(count: number, overrides: Partial<InvoiceItemData> = {}): InvoiceItemData[] {
  return Array.from({ length: count }, (_, n) => invoiceLine(overrides, n));
}

/** The header of an invoice saved on 5 October 2026, number 42, for one GRN. */
export function invoiceHeader(overrides: Partial<InvoiceHeaderData> = {}): InvoiceHeaderData {
  return {
    inv_date: '2026-10-05',
    inv_fin_year: '2026-27',
    inv_no: 42,
    customer_id: IDS.customer,
    customer_name: 'Example Traders',
    gr_id: IDS.grn,
    gr_no: 'A0010',
    one_time_charge: false,
    discount: 0,
    labour: 200,
    tax_amount: 35,
    total: 735,
    ...overrides,
  };
}

/** What the store gets for an invoice opened for editing (the argument of `loadInvoiceEditData`). */
export function editPayload(
  items: InvoiceItemData[] = [invoiceLine()],
  header: Partial<InvoiceHeaderData> = {}
) {
  const full = invoiceHeader(header);
  return { invoiceId: IDS.invoice, grId: full.gr_id, header: full, items };
}

/** What the service answers when a GRN's lines are asked for. */
export function grnFormAnswer(
  items: InvoiceItemData[] = [invoiceLine()],
  header: Partial<InvoiceHeaderData> = {}
) {
  return {
    success: true as const,
    data: {
      header: {
        customer_id: IDS.customer,
        customer_name: 'Example Traders',
        gr_id: IDS.grn,
        gr_no: 'A0010',
        ...header,
      },
      items,
    },
  };
}

/** A GRN as the picker lists it. */
export function invoiceableGrn(overrides: Partial<InvoiceableGrn> = {}): InvoiceableGrn {
  return {
    id: IDS.otherGrn,
    gr_no: 'A0011',
    date: '2026-10-02',
    customer_id: IDS.customer,
    customer_name: 'Example Traders',
    sender_name: '',
    supervisor_name: '',
    total_dispatched_qty: 12,
    has_uninvoiced_items: true,
    ...overrides,
  };
}

/** A store with the real invoice-form slice, and the theme and role the screens read. */
export function makeInvoiceStore({ role = 'staff' }: { role?: string } = {}) {
  return configureStore({
    reducer: {
      invoiceForm: invoiceFormReducer,
      auth: () => ({ userProfile: { role } }),
      theme: () => ({ preference: 'light', brand: 'orange' }),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}
export type InvoiceStore = ReturnType<typeof makeInvoiceStore>;

/**
 * The module `@/store/hooks` for a test that holds its store in a variable:
 * `jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore))`.
 */
export function storeHooks(getStore: () => InvoiceStore) {
  return {
    useAppDispatch: () => getStore().dispatch,
    useAppStore: () => getStore(),
    useAppSelector: (selector: (state: ReturnType<InvoiceStore['getState']>) => unknown) =>
      useSyncExternalStore(
        (listener) => getStore().subscribe(listener),
        () => selector(getStore().getState())
      ),
  };
}

/** Opens an invoice for editing in the store, as the edit layout does. */
export function openForEdit(store: InvoiceStore, items?: InvoiceItemData[], header?: Partial<InvoiceHeaderData>) {
  store.dispatch(resetForm());
  store.dispatch(loadInvoiceEditData(editPayload(items, header)));
}

/** Puts a GRN's lines into a new invoice, as choosing a GRN does. */
export function fillNewInvoice(store: InvoiceStore, items: InvoiceItemData[] = [invoiceLine()]) {
  store.dispatch(loadInvoiceFormData({
    header: { customer_id: IDS.customer, customer_name: 'Example Traders', gr_id: IDS.grn, gr_no: 'A0010' },
    items,
    grId: IDS.grn,
  }));
}

/**
 * The shapes of the six edge-case GRNs on the Dev facility (WMIV0101-0106), as lines of an invoice.
 * Names and numbers are fictional; the line totals follow from the rates.
 */
const edgeGroup = (count: number, startAt: number, overrides: Partial<InvoiceItemData>): InvoiceItemData[] =>
  Array.from({ length: count }, (_, i) => invoiceLine({ ...overrides }, startAt + i));

export const edgeLines = {
  /** WMIV0101: one group of 125 dispatch lines (Rai, BULK-125) and one of 3; 128 lines in all. */
  bulk125: (): InvoiceItemData[] => [
    ...edgeGroup(125, 0, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'BULK-125', qty: 12, weight: 25, charge: 3.5, labour_rate: 1, tax: 5 }),
    ...edgeGroup(3, 125, { item_id: 'onion', item_name: 'Big Qty Onion', package_mark: 'BQ-9', qty: 10, weight: 50, charge: 4, labour_rate: 1, tax: 5 }),
  ],
  /** WMIV0102: 12 groups of 2-4 lines, the same item with different marks, and two lots with one mark that form one group. */
  manyGroups: (): InvoiceItemData[] => {
    const lines: InvoiceItemData[] = [];
    let n = 0;
    for (let g = 0; g < 12; g++) {
      const count = 2 + (g % 3);
      lines.push(...edgeGroup(count, n, { item_id: g < 6 ? 'rai' : `item-${g}`, item_name: g < 6 ? 'Example Rai' : `Example Item ${g}`, package_mark: g < 6 ? (g === 5 ? 'SAME-MARK' : `MARK-${g}`) : `LOT-${g}` }));
      n += count;
    }
    // The second lot of SAME-MARK: another grn_item_id, the same item and mark, so the same group.
    lines.push(...edgeGroup(2, n, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'SAME-MARK', grn_item_id: 'second-lot', rack: 'R-R5' }));
    return lines;
  },
  /** WMIV0103: ONE_TIME pricing; no labour, and "One-time" in place of a duration. */
  oneTime: (): InvoiceItemData[] => [
    ...edgeGroup(2, 0, { item_id: 'kashmiri', item_name: 'Example Kashmiri', package_mark: 'OT-1', qty: 20, charge: 40, labour_rate: 0, tax: 5, one_time: true }),
    ...edgeGroup(2, 2, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'OT-2', qty: 30, charge: 6.5, labour_rate: 0, tax: 5, one_time: true }),
  ],
  /** WMIV0104: one line whose total is near the design edge, ₹96,934.70. */
  nearEdge: (): InvoiceItemData[] => [
    invoiceLine({ item_id: 'kashmiri', item_name: 'Example Kashmiri', package_mark: 'HIGH-1', qty: 263, weight: 1, charge: 99.95, labour_rate: 12.5, tax: 18, duration: 3, no_of_days: 90 }),
  ],
  /** WMIV0105: a dispatch on the GRN's own day, 1 month and 1 day in the legacy preview. */
  sameDay: (): InvoiceItemData[] => [
    invoiceLine({ item_id: 'rai', item_name: 'Example Rai', package_mark: 'SD-1', qty: 10, charge: 5, labour_rate: 0, tax: 0, duration: 1, no_of_days: 1, grn_date: '2026-10-01', dispatch_date: '2026-10-01' }),
  ],
  /** WMIV0106: 1 bag, no weight, no mark, no rack, for an ordinary customer. */
  smallest: (): InvoiceItemData[] => [
    invoiceLine({ item_id: 'garlic', item_name: 'Garlic', package_mark: '', rack: '', weight: 0, qty: 1, charge: 7, labour_rate: 3, tax: 5, duration: 1, no_of_days: 30 }),
  ],
};

/**
 * The GRNs of the flow tests (src/tests/flows). Totals, with 5 % tax on storage plus labour:
 * - A: two potato lines of 100 bags (mark M1, charge 5, labour 2: 735 each) and one onion line of 50 bags
 *   (mark M2, charge 4, labour 1, no tax: 250). Grand total 1,720.
 * - B: 20 bags of garlic (mark G1, charge 10, labour 2, 12 % tax: 268.80).
 */
export const flowLines = {
  grnA: (): InvoiceItemData[] => [
    invoiceLine({ item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1' }, 0),
    invoiceLine({ item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1' }, 1),
    invoiceLine({ item_id: 'i2', item_name: 'Example Onions', package_mark: 'M2', qty: 50, weight: 40, charge: 4, labour_rate: 1, tax: 0 }, 2),
  ],
  grnB: (): InvoiceItemData[] => [
    invoiceLine({ item_id: 'i3', item_name: 'Example Garlic', package_mark: 'G1', qty: 20, weight: 30, charge: 10, labour_rate: 2, tax: 12 }, 10),
  ],
};
