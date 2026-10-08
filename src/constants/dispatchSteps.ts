import { StepConfig } from '@/components/StepIndicator';

/**
 * Configuration for Dispatch creation steps
 * Used by StepIndicator and navigation components
 */
export const DISPATCH_STEPS: StepConfig[] = [
  {
    label: 'Basic Info',
    shortLabel: 'Info',
  },
  {
    label: 'Items Selection',
    shortLabel: 'Items',
  },
  {
    label: 'Review & Submit',
    shortLabel: 'Review',
  },
];

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
  if (currentStep >= DISPATCH_STEPS.length) {
    return 'Create Dispatch';
  }
  const nextStep = DISPATCH_STEPS[currentStep];
  return `Next: ${nextStep.shortLabel}`;
}

/**
 * Get completed steps array for StepIndicator
 */
export function getDispatchCompletedSteps(currentStep: number): number[] {
  return Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
}
