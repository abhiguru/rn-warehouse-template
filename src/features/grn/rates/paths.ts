/** The customer's "Your rate" page for one item of a GRN, opened from a row of the GRN's Rates (2026-10-16). */
export const yourRatePath = (grnId: string, itemId: string, grnNumber?: string) =>
  ({ pathname: '/grn-rate/[grnId]/[itemId]', params: { grnId, itemId, ...(grnNumber ? { no: grnNumber } : {}) } }) as const;

/**
 * The Review step of the GRN's edit, scrolled to its Rates block: where a rate typed on this GRN only was set and
 * is changed (owner, 2026-10-17). Opened from a row of the GRN's Rates by an administrator or supervisor.
 */
export const grnRatesStepPath = (grnId: string) =>
  ({ pathname: '/grn-edit/[id]/step3', params: { id: grnId, focus: 'rates' } }) as const;
