import { t } from '@/i18n';

/**
 * Field errors of the invoice form as plain sentences for an alert (style
 * guide §12.2), never raw field keys: each different message once, five at
 * most. Used by the new-invoice form and by the edit form, so both say what
 * the check found in the same words.
 */
export function describeValidationErrors(errors: Record<string, string>): string {
  const messages = Array.from(new Set(Object.values(errors).filter(Boolean)));
  if (messages.length === 0) return t('invoice.form.fillRequired');
  return messages.slice(0, 5).join('\n');
}
