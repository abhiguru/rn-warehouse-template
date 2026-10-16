/** The customer's "Your rate" page for one item of a GRN, opened from a row of the GRN's Rates (2026-10-16). */
export const yourRatePath = (grnId: string, itemId: string, grnNumber?: string) =>
  ({ pathname: '/grn-rate/[grnId]/[itemId]', params: { grnId, itemId, ...(grnNumber ? { no: grnNumber } : {}) } }) as const;
