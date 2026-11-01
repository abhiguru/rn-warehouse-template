/**
 * The figures shared by the GRN rate tables (GrnItemRates, GrnRatesSection, GrnRateSheet): how a
 * rate figure is written and the column widths it starts from. In a module of its own so that
 * the three components, which import one another, do not import these through each other.
 */
import { localizeDigits } from '@/i18n';
import { formatNumber } from '@/utils/formatters';

/** Column widths at font scale 1; each grows with its widest value. */
export const RENT_WIDTH = 56;
export const LABOUR_WIDTH = 56;
export const TAX_WIDTH = 40;

/** A money cell: "88.00" (the ₹ is in the heading); "—" without a rate. */
export const amountText = (value: number | null): string => (value === null ? '—' : formatNumber(value, 2));
/** A tax cell: "18" or "12.5" (the % is in the heading); "—" without a rate. */
export const taxText = (value: number | null): string => (value === null ? '—' : localizeDigits(String(value)));
