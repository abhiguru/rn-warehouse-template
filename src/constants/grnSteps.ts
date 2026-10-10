/**
 * The GRN wizard: how many steps it has and their numbers.
 * The step names are text: `grnSteps()` in src/features/grn/utils/grnStepLabels.ts.
 */
export const GRN_STEP_COUNT = 3;

/**
 * Step numbers for easy reference
 */
export const STEP_NUMBERS = {
  HEADER: 1,
  ITEMS: 2,
  REVIEW: 3,
} as const;

/**
 * Get completed steps array for StepIndicator
 */
export function getCompletedSteps(currentStep: number): number[] {
  return Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
}
