/**
 * Names of the GRN wizard steps in the app's language.
 *
 * The steps are identified by position (1 details, 2 items, 3 review); the
 * English labels in src/constants/grnSteps.ts are not shown.
 */
import type { StepConfig } from '@/components/StepIndicator';
import { t, type TranslationKey } from '@/i18n';

const STEP_KEYS: { label: TranslationKey; shortLabel: TranslationKey }[] = [
  { label: 'grn.steps.details', shortLabel: 'grn.steps.detailsShort' },
  { label: 'grn.steps.items', shortLabel: 'grn.steps.items' },
  { label: 'grn.steps.review', shortLabel: 'grn.steps.review' },
];

/** The given steps with their names in the app's language; a step beyond the three known ones keeps its own label. */
export const localizeGRNSteps = (steps: StepConfig[]): StepConfig[] =>
  steps.map((step, index) => {
    const keys = STEP_KEYS[index];
    return keys ? { ...step, label: t(keys.label), shortLabel: t(keys.shortLabel) } : step;
  });
