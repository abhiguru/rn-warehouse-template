import { StepConfig } from '@/components/StepIndicator';

/**
 * Configuration for GRN creation steps
 * Used by StepIndicator and navigation components
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
  if (currentStep >= GRN_STEPS.length) {
    return 'Create GRN';
  }
  const nextStep = GRN_STEPS[currentStep];
  return `Next: ${nextStep.shortLabel}`;
}

/**
 * Get completed steps array for StepIndicator
 */
export function getCompletedSteps(currentStep: number): number[] {
  return Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
}
