import { StepConfig } from '@/components/StepIndicator';
import { t } from '@/i18n';

/**
 * Configuration for GRN creation steps
 * Used by StepIndicator and navigation components
 *
 * The labels here are English and fixed when the file loads: use the array for
 * its length and order only. For labels on screen call `getGrnSteps()`.
 */
export const GRN_STEPS: StepConfig[] = [
  {
    label: 'GRN details',
    shortLabel: 'Details',
  },
  {
    label: 'Items',
    shortLabel: 'Items',
  },
  {
    label: 'Review',
    shortLabel: 'Review',
  },
];

/** The GRN steps with their labels in the app's language. Call it while rendering. */
export function getGrnSteps(): StepConfig[] {
  return [
    { label: t('validation.steps.grn.details'), shortLabel: t('validation.steps.short.details') },
    { label: t('validation.steps.short.items'), shortLabel: t('validation.steps.short.items') },
    { label: t('validation.steps.short.review'), shortLabel: t('validation.steps.short.review') },
  ];
}

/**
 * Step numbers for easy reference
 */
export const STEP_NUMBERS = {
  HEADER: 1,
  ITEMS: 2,
  REVIEW: 3,
} as const;

/**
 * Get next step label for navigation button
 */
export function getNextStepLabel(currentStep: number): string {
  const steps = getGrnSteps();
  if (currentStep >= steps.length) {
    return t('validation.steps.grn.create');
  }
  const nextStep = steps[currentStep];
  return t('validation.steps.next', { step: nextStep.shortLabel });
}

/**
 * Get completed steps array for StepIndicator
 */
export function getCompletedSteps(currentStep: number): number[] {
  return Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
}
