/**
 * The invoice state of a GRN (backend migration 165, WH-138, WH-112's one rule): Invoiced (no stock and every dispatch line
 * on a live invoice), Partly invoiced (a live invoice, not yet Invoiced) or Not invoiced. The server works it out
 * (`invoice_state`); the app only shows it.
 */
import { t, type TranslationKey } from '@/i18n';
import type { StatusKind } from '@/components/ui/StatusTag';

export type InvoiceState = 'not_invoiced' | 'partly_invoiced' | 'invoiced';

/** The state the server sent, or undefined when it sent none (an older backend) or something else. */
export function parseInvoiceState(value: unknown): InvoiceState | undefined {
  return value === 'not_invoiced' || value === 'partly_invoiced' || value === 'invoiced' ? value : undefined;
}

const LABEL: Record<InvoiceState, TranslationKey> = {
  not_invoiced: 'charging.invoiceState.not_invoiced',
  partly_invoiced: 'charging.invoiceState.partly_invoiced',
  invoiced: 'charging.invoiceState.invoiced',
};

export const invoiceStateLabel = (state: InvoiceState): string => t(LABEL[state]);

export const invoiceStateKind = (state: InvoiceState): StatusKind =>
  state === 'invoiced' ? 'positive' : state === 'partly_invoiced' ? 'critical' : 'neutral';
