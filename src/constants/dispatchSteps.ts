/**
 * The dispatch wizard: how many steps it has and their numbers.
 * The step names are text: `dispatchSteps()` in src/components/DispatchStepIndicator.tsx.
 */
export const DISPATCH_STEP_COUNT = 3;

/**
 * Step numbers for easy reference
 */
export const DISPATCH_STEP_NUMBERS = {
  INFO: 1,
  ITEMS: 2,
  REVIEW: 3,
} as const;

/**
 * Get completed steps array for StepIndicator
 */
export function getDispatchCompletedSteps(currentStep: number): number[] {
  return Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
}
