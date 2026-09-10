/**
 * Customer Form Steps Configuration
 *
 * Defines the multi-step wizard configuration for customer create/edit forms.
 * Used by StepIndicator and navigation components.
 */

import { StepConfig } from '@/components/StepIndicator';

/**
 * Configuration for customer form steps
 */
export const CUSTOMER_STEPS: StepConfig[] = [
  {
    label: 'Basic Information',
    shortLabel: 'Basic',
  },
  {
    label: 'Address & Tax Details',
    shortLabel: 'Details',
  },
  {
    label: 'Documents & Review',
    shortLabel: 'Review',
  },
];

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
export const CUSTOMER_TOTAL_STEPS = CUSTOMER_STEPS.length;

/**
 * Get next step label for navigation button
 */
export function getNextStepLabel(currentStep: number, isEditMode: boolean = false): string {
  if (currentStep >= CUSTOMER_STEPS.length) {
    return isEditMode ? 'Update Customer' : 'Create Customer';
  }
  const nextStep = CUSTOMER_STEPS[currentStep];
  return `Next: ${nextStep.shortLabel}`;
}

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
 * Step titles for review display
 */
export const CUSTOMER_STEP_TITLES = {
  [CUSTOMER_STEP_NUMBERS.BASIC]: 'Basic Information',
  [CUSTOMER_STEP_NUMBERS.DETAILS]: 'Address & Tax Details',
  [CUSTOMER_STEP_NUMBERS.REVIEW]: 'Documents & Review',
} as const;

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
