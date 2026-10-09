import { StyleSheet } from 'react-native';
import type { StepConfig } from '@/components/StepIndicator';
import {
  fontWeight,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { parseLocalISODate } from '@/utils/formatters';

// Step names are nouns (style guide §14.3).
export const INVOICE_STEPS: StepConfig[] = [
  { number: 1, label: 'Details', shortLabel: 'Details' },
  { number: 2, label: 'Items', shortLabel: 'Items' },
  { number: 3, label: 'Review', shortLabel: 'Review' },
];

export const STEP_NUMBERS = {
  HEADER: 1,
  ITEMS: 2,
  REVIEW: 3,
} as const;

export function getCompletedSteps(currentStep: number): number[] {
  const completed: number[] = [];
  for (let i = 1; i < currentStep; i++) {
    completed.push(i);
  }
  return completed;
}

/**
 * An invoice date for display (style guide §12.3): "9 Oct 2026".
 * Date-only strings are read in local time so the day never shifts.
 */
export function formatInvoiceDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalISODate(value) : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Shared styles for the invoice create and edit wizard screens: form fields
 * (§13.2), key-value review cards (§13.6) and the bottom action bar (§13.8).
 * Module-level so useThemedStyles caches one stylesheet per theme.
 */
export const makeInvoiceWizardStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  // Form fields
  formGroup: {
    gap: space.xs,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  labelError: {
    color: t.status.negative.text,
  },
  required: {
    color: t.text.required,
  },
  field: {
    ...typography.body,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    color: t.text.primary,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  fieldRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: 0,
    paddingRight: 0,
  },
  fieldPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  fieldError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  fieldValue: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
    paddingVertical: space.sm,
  },
  fieldPlaceholder: {
    color: t.text.placeholder,
  },
  fieldIconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  fieldSpinner: {
    width: touchTarget,
    alignItems: 'center' as const,
  },
  readOnlyField: {
    minHeight: touchTarget,
    borderRadius: radius.field,
    backgroundColor: t.surface.fieldReadOnly,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    justifyContent: 'center' as const,
  },
  readOnlyText: {
    ...typography.body,
    color: t.text.primary,
  },
  readOnlyPlaceholder: {
    color: t.text.secondary,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  messageRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
  },
  errorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
  warningText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.critical.text,
  },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: layout.rowMinHeight,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  switchRowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  switchLabelContainer: {
    flex: 1,
    gap: space.xxs,
  },
  switchLabel: {
    ...typography.body,
    color: t.text.primary,
  },
  // Review cards
  sectionHeader: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginBottom: space.sm,
    marginLeft: space.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  sectionHeaderInRow: {
    flex: 1,
    marginBottom: 0,
  },
  editLink: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.sm,
  },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    ...t.shadow[2],
  },
  kvRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: layout.rowMinHeight,
    paddingVertical: space.sm,
  },
  kvRowStacked: {
    minHeight: layout.rowMinHeight,
    paddingVertical: space.sm,
    gap: space.xxs,
  },
  kvDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  kvKey: {
    ...typography.subhead,
    color: t.text.secondary,
    flexShrink: 1,
  },
  kvValue: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'right' as const,
    flexShrink: 1,
  },
  kvValueStacked: {
    ...typography.body,
    color: t.text.primary,
  },
  numeric: {
    fontVariant: ['tabular-nums' as const],
  },
  kvTotalRow: {
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  kvTotalKey: {
    ...typography.headline,
    color: t.text.primary,
  },
  kvTotalValue: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  kvDeduction: {
    color: t.status.positive.text,
  },
  // Info and helper panels
  infoStrip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.informative.border,
    backgroundColor: t.status.informative.background,
  },
  infoStripContent: {
    flex: 1,
    gap: space.xs,
  },
  infoStripTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.status.informative.text,
  },
  infoStripText: {
    ...typography.footnote,
    color: t.text.primary,
  },
  bold: {
    fontWeight: fontWeight.semibold,
  },
  loadingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    padding: space.lg,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  // Bottom action bar (§13.8 form chrome)
  bottomBar: {
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.separator,
    ...t.shadow[3],
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.button,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  primaryButton: {
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: 'transparent',
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  buttonBusy: {
    opacity: t.interaction.disabledOpacity,
  },
});
