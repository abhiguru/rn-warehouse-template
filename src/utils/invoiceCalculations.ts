/**
 * Invoice Calculation Utilities
 *
 * Pure functions for invoice pricing, duration, and total calculations.
 * Extracted from Redux reducers for better testability and reusability.
 */

import type { GroupRates, InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';
import { localizeDigits, t } from '@/i18n';

/**
 * Round money values to 2 decimal places
 * Prevents floating-point precision errors in currency calculations
 */
/**
 * Staff must give a reason whenever they change an invoice's discount
 * (server migration 30). An unchanged discount keeps its recorded reason.
 */
export function discountNeedsReason(
  header: { discount: number; saved_discount?: number; discount_reason?: string },
  role: string | null | undefined
): boolean {
  if (role !== 'staff') return false;
  if (roundMoney(header.discount || 0) === roundMoney(header.saved_discount || 0)) return false;
  return !(header.discount_reason || '').trim();
}

/**
 * A line whose storage charge is 0 (owner decision 3 of 2026-10-11: allowed, with a reason).
 *
 * Decided after rounding to two decimals, as the server decides it (migration
 * 48 rounds the charge before it compares with 0). Everything that depends on
 * a line being free goes through here: whether the reason field is shown,
 * whether staff must fill it in, whether `zero_charge_reason` is sent, the
 * line in the save question and the total of 0 that may be saved. So a charge
 * the money fields cannot produce (0.004) cannot make the server ask for a
 * reason while the app shows no field for it.
 *
 * The Save check in features/invoice/schemas/invoiceValidation.ts relies on this reading only `charge`: it checks
 * a line's fields one distinct value at a time. If this ever reads another field, change that check too.
 */
export function isZeroChargeLine(item: { charge?: number | null }): boolean {
  return roundMoney(Number(item.charge) || 0) === 0;
}

export function hasZeroChargeLine(items: { charge?: number | null }[]): boolean {
  return items.some(isZeroChargeLine);
}

/**
 * Staff must give a reason when a line of the invoice has a zero charge
 * (server migration 48); administrators and supervisors may leave it empty.
 *
 * The reason is the text in the form. For an invoice being edited that is the
 * stored reason until the person changes it: the server asks staff for a
 * reason on every save of an invoice with a free line, also when someone else
 * made the line free, and takes an empty one from an administrator or
 * supervisor as "remove the reason". So the stored text is sent back as it is.
 */
export function zeroChargeNeedsReason(
  header: { zero_charge_reason?: string | null },
  items: { charge?: number | null }[],
  role: string | null | undefined
): boolean {
  if (role !== 'staff') return false;
  if (!hasZeroChargeLine(items)) return false;
  return !(header.zero_charge_reason || '').trim();
}

/**
 * The text of the question before an invoice is saved or updated: the customer
 * and the total (which the server checks: a different total saves nothing) and, when lines have a charge of 0, how
 * many do.
 *
 * The last line is for every role. A line can be free on purpose, or because
 * its item has no price in the price list (it then arrives with a charge of
 * 0). Staff are stopped for a reason either way; administrators and
 * supervisors need none, and without this line would save a free invoice
 * without having been told.
 */
export function invoiceConfirmMessage(
  header: { customer_name: string; total: number },
  items: { charge?: number | null }[]
): string {
  const message = t('invoice.review.confirmMessage', {
    customer: header.customer_name,
    total: formatInvoiceAmount(header.total),
  });
  const freeLines = items.filter(isZeroChargeLine).length;
  return freeLines > 0 ? `${message}\n\n${t('invoice.review.zeroChargeCount', { count: freeLines })}` : message;
}

export function roundMoney(value: number): number {
  // Compensate only for binary representation noise at a decimal half-cent.
  // PostgreSQL NUMERIC rounds ties away from zero, including surcharges.
  const scaled = Math.abs(value) * 100;
  return Math.sign(value) * Math.round(scaled + Number.EPSILON * scaled) / 100;
}

/**
 * Calculate financial year from date (April-March cycle)
 * @example
 * calculateFinancialYear('2024-03-15') // Returns "2023-24"
 * calculateFinancialYear('2024-04-01') // Returns "2024-25"
 */
export function calculateFinancialYear(dateString: string): string {
  // A plain calendar date is read as written. `new Date('2026-04-01')` is
  // midnight UTC, which is still 31 March in a time zone behind UTC.
  const plainDate = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateString);
  const date = new Date(dateString);
  const month = plainDate ? Number(plainDate[2]) - 1 : date.getMonth(); // 0-11
  const year = plainDate ? Number(plainDate[1]) : date.getFullYear();

  // April (3) to March (2)
  // If month is Jan (0), Feb (1), Mar (2), FY is (year-1)-year
  // If month is Apr (3) onwards, FY is year-(year+1)
  if (month >= 3) {
    // Apr onwards
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    // Jan-Mar
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

/**
 * Calculate amounts for a single invoice item
 */
export interface ItemAmounts {
  amount: number;
  labour_amount: number;
  taxable_amount: number;
  tax_amount: number;
  item_total: number;
}

/**
 * The amounts of one line, computed as the server computes them
 * (recalculate_invoice_header, backend docs/INVOICE_RULES.md).
 *
 * A monthly line is storage (qty x charge x duration) plus labour (qty x
 * labour rate), each rounded to two places. A line of a ONE_TIME GRN
 * (`oneTime`) is storage charged once per unit: no duration, no labour.
 * Which of the two applies is the GRN's pricing mode; the client cannot choose.
 */
export function calculateItemAmounts(
  qty: number,
  charge: number,
  labour_rate: number,
  tax: number,
  duration: number,
  oneTime: boolean = false
): ItemAmounts {
  // Guard against NaN - use 0 as safe default for invalid values
  const safeQty = isNaN(qty) || qty < 0 ? 0 : qty;
  const safeCharge = isNaN(charge) || charge < 0 ? 0 : charge;
  const safeLabourRate = isNaN(labour_rate) || labour_rate < 0 ? 0 : labour_rate;
  const safeTax = isNaN(tax) || tax < 0 ? 0 : tax;
  const safeDuration = isNaN(duration) || duration <= 0 ? 1 : duration;

  const amount = roundMoney(oneTime ? safeQty * safeCharge : safeQty * safeCharge * safeDuration);
  const labour_amount = oneTime ? 0 : roundMoney(safeQty * safeLabourRate);
  const taxable_amount = roundMoney(amount + labour_amount);
  const tax_amount = roundMoney(taxable_amount * (safeTax / 100));
  const item_total = roundMoney(taxable_amount + tax_amount);

  return {
    amount,
    labour_amount,
    taxable_amount,
    tax_amount,
    item_total,
  };
}

/**
 * Apply pricing to an invoice item
 */
export function applyPricingToItem(
  item: InvoiceItemData,
  pricing: {
    charge?: number;
    labour_rate?: number;
    tax?: number;
    duration?: number;
  }
): InvoiceItemData {
  const charge = pricing.charge ?? item.charge;
  const labour_rate = pricing.labour_rate ?? item.labour_rate;
  const tax = pricing.tax ?? item.tax;
  const duration = pricing.duration ?? item.duration;

  const amounts = calculateItemAmounts(
    item.qty,
    charge,
    labour_rate,
    tax,
    duration,
    item.one_time
  );

  return {
    ...item,
    charge,
    labour_rate,
    tax,
    duration,
    ...amounts,
  };
}

/**
 * Calculate header totals from items
 */
export interface HeaderTotals {
  labour: number;
  tax_amount: number;
  total: number;
}

export function calculateHeaderTotals(
  items: InvoiceItemData[],
  discount: number = 0
): HeaderTotals {
  // Guard against NaN values (allow negative discounts as they act as surcharges)
  const safeDiscount = isNaN(discount) ? 0 : discount;

  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + (isNaN(item.amount) ? 0 : item.amount), 0)
  );
  const labour = roundMoney(
    items.reduce((sum, item) => sum + (isNaN(item.labour_amount) ? 0 : item.labour_amount), 0)
  );
  // The database preview ceilings the sum of UNROUNDED line taxes.
  // Base amounts and persisted tax percentages have two decimal places. Sum
  // their integer products before division to avoid a spurious extra rupee at
  // floating-point integer boundaries (e.g. ten lines taxed at 0.1 rupee).
  const taxUnits = items.reduce((sum, item) => {
    const baseCents = Math.round(roundMoney(item.amount + item.labour_amount) * 100);
    const rateHundredths = Math.round(item.tax * 100);
    return sum + (Number.isFinite(baseCents) && Number.isFinite(rateHundredths)
      ? baseCents * Math.max(0, rateHundredths) : 0);
  }, 0);
  const tax_amount = Math.ceil(taxUnits / 1_000_000);
  // save_invoice and update_invoice cast total to NUMERIC(12,2), then CEIL.
  // Preserve the existing absolute discount (negative means surcharge).
  const total = Math.ceil(roundMoney(subtotal + labour + tax_amount - safeDiscount));

  return {
    labour,
    tax_amount,
    total,
  };
}

/** Saved headers expose net-before-tax, not the original storage subtotal. */
export function savedInvoiceAmounts(header: { total: number; tax_amount: number; discount: number }) {
  return {
    netBeforeTax: roundMoney(header.total - header.tax_amount),
    hasAdjustment: header.discount !== 0,
    /** A negative discount is a surcharge. Use this, not the label, to tell them apart: the label is translated. */
    isSurcharge: header.discount < 0,
    adjustmentLabel: header.discount < 0 ? t('invoice.label.surcharge') : t('invoice.label.discount'),
    adjustmentSign: header.discount < 0 ? '+' : '-',
    adjustmentAmount: Math.abs(header.discount),
  };
}

/** Keep storage and save rounding separate; never infer storage from total. */
export function calculateInvoiceBreakdown(
  items: InvoiceItemData[],
  header: Pick<InvoiceHeaderData, 'labour' | 'tax_amount' | 'discount' | 'total'>
): { subtotal: number; base: number; rounding: number } {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  const base = roundMoney(subtotal + header.labour + header.tax_amount);
  return { subtotal, base, rounding: roundMoney(header.total - (base - header.discount)) };
}

/**
 * Parse group key into item_id and package_mark
 * Supports both ::: delimiter (preferred) and _ delimiter (legacy)
 */
export function parseGroupKey(groupKey: string): {
  item_id: string;
  package_mark: string;
} {
  // Prefer ::: delimiter to avoid issues with underscores in UUIDs
  if (groupKey.includes(':::')) {
    const parts = groupKey.split(':::');
    return {
      item_id: parts[0],
      package_mark: parts[1] || '',
    };
  }

  // Legacy underscore format - use first underscore
  const firstUnderscoreIndex = groupKey.indexOf('_');
  if (firstUnderscoreIndex === -1) {
    return { item_id: groupKey, package_mark: '' };
  }

  return {
    item_id: groupKey.substring(0, firstUnderscoreIndex),
    package_mark: groupKey.substring(firstUnderscoreIndex + 1),
  };
}

/**
 * Generate group key from item_id and package_mark
 * Uses ::: delimiter to avoid issues with underscores in UUIDs
 */
export function generateGroupKey(itemId: string, packageMark: string): string {
  return `${itemId}:::${packageMark}`;
}

/**
 * Recalculate a single item with edited values
 * Used by updateEditedItem reducer
 */
export function recalculateItemWithEdits(
  item: InvoiceItemData,
  editedValues: Partial<{
    duration: number;
    charge: number;
    labour_rate: number;
    tax: number;
    no_of_days: number;
  }>
): InvoiceItemData {
  const duration = editedValues.duration ?? item.duration;
  const charge = editedValues.charge ?? item.charge;
  const labour_rate = editedValues.labour_rate ?? item.labour_rate;
  const tax = editedValues.tax ?? item.tax;
  const no_of_days = Math.round(editedValues.no_of_days ?? item.no_of_days);

  const amounts = calculateItemAmounts(item.qty, charge, labour_rate, tax, duration, item.one_time);

  return {
    ...item,
    duration,
    charge,
    labour_rate,
    tax,
    no_of_days,
    ...amounts,
  };
}

/**
 * The duration and days the server worked out for one line of an invoice, in its refusal TOTAL_CHANGED (owner decision
 * D18): the figures the total it names was made from.
 */
export interface ServerLineDuration {
  disp_trl_id: string;
  duration: number;
  no_of_days: number;
}

/**
 * The lines of a TOTAL_CHANGED refusal (`fields.lines`), as far as they are well formed: a dispatch line id, a duration
 * above 0 and a whole number of days (a negative one too: old rows hold them, and the server counted with it). Anything
 * else is left out, so a line the app cannot read keeps its own figures.
 */
export function serverLineDurations(value: unknown): ServerLineDuration[] {
  if (!Array.isArray(value)) return [];
  const lines: ServerLineDuration[] = [];
  value.forEach((entry) => {
    if (typeof entry !== 'object' || entry === null) return;
    const { disp_trl_id, duration, no_of_days } = entry as Record<string, unknown>;
    const months = Number(duration);
    const days = Number(no_of_days);
    if (typeof disp_trl_id !== 'string' || disp_trl_id === '') return;
    if (!Number.isFinite(months) || months <= 0 || !Number.isFinite(days)) return;
    lines.push({ disp_trl_id, duration: months, no_of_days: Math.round(days) });
  });
  return lines;
}

/** One line of a RATES_CHANGED refusal: the fields whose looked-up rate changed and the rates the server looks up now. */
export interface ServerLineRates {
  disp_trl_id: string;
  fields: Array<'charge' | 'labour_rate' | 'tax'>;
  current: Partial<Record<'charge' | 'labour_rate' | 'tax', number>>;
}

const RATE_FIELD_NAMES = ['charge', 'labour_rate', 'tax'] as const;

/**
 * The lines of a RATES_CHANGED refusal (`lines`: disp_trl_id, fields, looked_up, current) that the app can read: a dispatch
 * line id, the changed fields it names (all three when it names none) and a finite current figure for each. Anything else is
 * left out, so a line the app cannot read keeps its own figures.
 */
export function serverLineRates(value: unknown): ServerLineRates[] {
  if (!Array.isArray(value)) return [];
  const lines: ServerLineRates[] = [];
  value.forEach((entry) => {
    if (typeof entry !== 'object' || entry === null) return;
    const { disp_trl_id, fields, current } = entry as Record<string, unknown>;
    if (typeof disp_trl_id !== 'string' || disp_trl_id === '' || typeof current !== 'object' || current === null) return;
    const named = Array.isArray(fields) ? RATE_FIELD_NAMES.filter((name) => fields.includes(name)) : [...RATE_FIELD_NAMES];
    const rates: ServerLineRates['current'] = {};
    named.forEach((name) => {
      const figure = (current as Record<string, unknown>)[name];
      const number = typeof figure === 'string' && figure.trim() !== '' ? Number(figure) : figure;
      if (typeof number === 'number' && Number.isFinite(number)) rates[name] = number;
    });
    const usable = named.filter((name) => rates[name] !== undefined);
    if (usable.length > 0) lines.push({ disp_trl_id, fields: usable, current: rates });
  });
  return lines;
}

/**
 * The lines with the server's own duration and days on every line it names (matched by dispatch line), and their
 * amounts worked out again. Rates, discount and everything else the person typed are not touched. Returns the same
 * array when no line changes.
 */
export function withServerDurations(
  items: InvoiceItemData[],
  lines: ServerLineDuration[]
): InvoiceItemData[] {
  if (lines.length === 0) return items;
  const byLine = new Map<string, ServerLineDuration>();
  lines.forEach((line) => byLine.set(line.disp_trl_id, line));
  let changed = false;
  const next = items.map((item) => {
    const server = byLine.get(item.disp_trl_id);
    if (!server || (server.duration === item.duration && server.no_of_days === item.no_of_days)) return item;
    changed = true;
    return recalculateItemWithEdits(item, { duration: server.duration, no_of_days: server.no_of_days });
  });
  return changed ? next : items;
}

/**
 * Apply group rates to the lines of one group, with override support.
 * Used by bulkUpdateItemGroupPricing reducer.
 *
 * Only the rates that are given are applied. A line keeps its own value for
 * every rate left out, and for a rate that was typed on the line itself.
 */
export interface BulkGroupPricingResult {
  updatedItems: InvoiceItemData[];
  updatedCount: number;
}

export function applyBulkGroupPricing(
  items: InvoiceItemData[],
  groupKey: string,
  pricing: GroupRates,
  itemOverrides: Record<string, string[]>
): BulkGroupPricingResult {
  const { item_id, package_mark } = parseGroupKey(groupKey);
  let updatedCount = 0;

  const updatedItems = items.map((item) => {
    // Check if item matches the group
    if (item.item_id !== item_id || item.package_mark !== package_mark) {
      return item;
    }

    updatedCount++;

    // Get override list for this item (if any)
    const overrides = itemOverrides[item.temp_id] || [];

    // Apply the group's values only to the fields that were given and are not overridden
    const rate = (field: 'charge' | 'labour_rate' | 'tax'): number => {
      const groupRate = pricing[field];
      return groupRate === undefined || overrides.includes(field) ? item[field] : groupRate;
    };
    const charge = rate('charge');
    const labour_rate = rate('labour_rate');
    const tax = rate('tax');

    // Recalculate amounts
    const amounts = calculateItemAmounts(item.qty, charge, labour_rate, tax, item.duration, item.one_time);

    return {
      ...item,
      charge,
      labour_rate,
      tax,
      ...amounts,
    };
  });

  return { updatedItems, updatedCount };
}

const invoiceMoneyFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Money on an invoice (style guide §12.3): Indian grouping, rupee sign and two
 * decimals, e.g. "₹1,23,456.50". Missing values show as "₹0.00". A negative
 * amount gets a leading minus sign: "−₹250.00". In Gujarati the digits are
 * ૦-૯: "₹૧,૯૦૬.૦૦".
 */
export function formatInvoiceAmount(amount: number | null | undefined): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const formatted = `₹${localizeDigits(invoiceMoneyFormat.format(Math.abs(value)))}`;
  return value < 0 ? `−${formatted}` : formatted;
}

/**
 * A deduction such as a discount, always shown with a minus sign
 * (style guide §13.11): "−₹250.00". Zero shows as "₹0.00".
 */
export function formatInvoiceDeduction(amount: number | null | undefined): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? Math.abs(amount) : 0;
  return value === 0 ? formatInvoiceAmount(0) : `−${formatInvoiceAmount(value)}`;
}
