/** Fictional lines and header for the Dispatch Review step tests. No jest globals: the tests bring their own mocks. */

export interface ReviewLineOptions {
  weight?: number | null;
  grn?: string;
  quantity?: number;
  received?: number;
  stock?: number;
  mark?: string;
  rack?: string;
  name?: string;
}

/** One dispatch line (a lot of a GRN) as the form holds it. */
export const reviewLine = (n: number, o: ReviewLineOptions = {}) => ({
  unique_id: `u${n}`,
  grns_id: `g${n}`,
  grns_gr_no: o.grn ?? `A10${n}`,
  grns_date: '2026-09-01',
  grns_customer_name: 'Fictional Traders',
  grnItems_id: `l${n}`,
  grnItems_item_id: `i${n}`,
  grnItems_item_name: o.name ?? `Fictional item ${n}`,
  grnItems_quantity: o.received ?? 100,
  grnItems_stock: o.stock ?? 40,
  grnItems_package_mark: o.mark ?? `M${n}`,
  grnItems_rack: o.rack ?? `R${n}`,
  grnItems_weight: o.weight === undefined ? 50 : (o.weight as number),
  disp_quantity: o.quantity ?? 5,
});

export const reviewHeader = {
  disp_no: 'I0042',
  disp_date: '2026-10-01',
  customer_id: 'c1',
  customer_name: 'Fictional Traders',
  customer_address: '12 Sample Road',
  customer_city: 'Samplepur',
  customer_mobile: '9876543210',
  registration: 'GJ01AB1234',
  supervisor_name: 'Asha',
  note: 'Fictional note',
};
