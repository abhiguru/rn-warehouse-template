import { StepConfig } from '@/components/StepIndicator';
import { t } from '@/i18n';

/**
 * Configuration for Dispatch creation steps
 * Used by StepIndicator and navigation components
 *
 * The labels here are English and fixed when the file loads: use the array for
 * its length and order only. For labels on screen call `getDispatchSteps()`.
 */
export const DISPATCH_STEPS: StepConfig[] = [
  {
    label: 'Dispatch details',
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

/** The dispatch steps with their labels in the app's language. Call it while rendering. */
export function getDispatchSteps(): StepConfig[] {
  return [
    { label: t('validation.steps.dispatch.details'), shortLabel: t('validation.steps.short.details') },
    { label: t('validation.steps.short.items'), shortLabel: t('validation.steps.short.items') },
    { label: t('validation.steps.short.review'), shortLabel: t('validation.steps.short.review') },
  ];
}

/**
 * Step numbers for easy reference
 */
export const DISPATCH_STEP_NUMBERS = {
  INFO: 1,
  ITEMS: 2,
  REVIEW: 3,
} as const;

/**
 * Get next step label for navigation button
 */
export function getDispatchNextStepLabel(currentStep: number): string {
  const steps = getDispatchSteps();
  if (currentStep >= steps.length) {
    return t('validation.steps.dispatch.create');
  }
  const nextStep = steps[currentStep];
  return t('validation.steps.next', { step: nextStep.shortLabel });
}

/**
 * Get completed steps array for StepIndicator
 */
export function getDispatchCompletedSteps(currentStep: number): number[] {
  return Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
}
