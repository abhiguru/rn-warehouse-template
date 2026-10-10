/**
 * Names of the GRN wizard steps in the app's language: the one source for every
 * GRN screen. The step numbers and count are in src/constants/grnSteps.ts.
 *
 * Call it while rendering, never at module level (docs/I18N.md).
 */
import type { StepConfig } from '@/components/StepIndicator';
import { t } from '@/i18n';

export const grnSteps = (): StepConfig[] => [
  { label: t('grn.steps.details'), shortLabel: t('grn.steps.detailsShort') },
  { label: t('grn.steps.items'), shortLabel: t('grn.steps.items') },
  { label: t('grn.steps.review'), shortLabel: t('grn.steps.review') },
];
