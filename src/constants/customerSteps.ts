/**
 * Customer Form Steps Configuration
 *
 * Defines the multi-step wizard configuration for customer create/edit forms.
 * Used by StepIndicator and navigation components.
 */

// The step names are text: `customerSteps()` in src/features/customer/customerStepLabels.ts.

/**
 * Step numbers for easy reference
 */
export const CUSTOMER_STEP_NUMBERS = {
  BASIC: 1,
  DETAILS: 2,
  REVIEW: 3,
} as const;

/**
 * Total number of steps
 */
export const CUSTOMER_TOTAL_STEPS = 3;

/**
 * Get completed steps array for StepIndicator
 */
export function getCompletedSteps(currentStep: number): number[] {
  return Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
}

/**
 * Check if a step is completed
 */
export function isStepCompleted(step: number, currentStep: number): boolean {
  return step < currentStep;
}

/**
 * Check if a step is the current step
 */
export function isCurrentStep(step: number, currentStep: number): boolean {
  return step === currentStep;
}

/**
 * Get step route path based on step number
 */
export function getStepRoutePath(
  step: number,
  mode: 'create' | 'edit',
  customerId?: string
): string {
  const stepPath = `step${step}`;

  if (mode === 'create') {
    return `/customer-form/${stepPath}`;
  } else {
    return `/customer-edit/${customerId}/${stepPath}`;
  }
}

/**
 * Fields per step (for validation grouping)
 */
export const CUSTOMER_STEP_FIELDS = {
  [CUSTOMER_STEP_NUMBERS.BASIC]: ['name', 'mobile', 'email'],
  [CUSTOMER_STEP_NUMBERS.DETAILS]: [
    'city',
    'state',
    'pincode',
    'address',
    'gst',
    'pan',
    'contact_name',
    'contact_mobile',
    'contact_email',
  ],
  [CUSTOMER_STEP_NUMBERS.REVIEW]: ['document_urls', 'document_images'],
} as const;
