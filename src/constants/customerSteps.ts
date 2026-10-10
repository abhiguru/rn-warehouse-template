/**
 * Customer Form Steps Configuration
 *
 * Defines the multi-step wizard configuration for customer create/edit forms.
 * Used by StepIndicator and navigation components.
 */

import { StepConfig } from '@/components/StepIndicator';
import { t } from '@/i18n';

/**
 * Configuration for customer form steps
 *
 * The labels here are English and fixed when the file loads: use the array for
 * its length and order only. For labels on screen call `getCustomerSteps()`.
 */
export const CUSTOMER_STEPS: StepConfig[] = [
  {
    label: 'Basic information',
    shortLabel: 'Basic',
  },
  {
    label: 'Address and tax details',
    shortLabel: 'Details',
  },
  {
    label: 'Documents and review',
    shortLabel: 'Review',
  },
];

/** The customer form steps with their labels in the app's language. Call it while rendering. */
export function getCustomerSteps(): StepConfig[] {
  return [
    { label: t('validation.steps.customer.basic'), shortLabel: t('validation.steps.short.basic') },
    { label: t('validation.steps.customer.details'), shortLabel: t('validation.steps.short.details') },
    { label: t('validation.steps.customer.review'), shortLabel: t('validation.steps.short.review') },
  ];
}

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
  const steps = getCustomerSteps();
  if (currentStep >= steps.length) {
    return isEditMode ? t('validation.steps.customer.update') : t('validation.steps.customer.create');
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
 * Step titles for review display (English, fixed at load). For titles on
 * screen call `getCustomerStepTitles()`.
 */
export const CUSTOMER_STEP_TITLES = {
  [CUSTOMER_STEP_NUMBERS.BASIC]: 'Basic information',
  [CUSTOMER_STEP_NUMBERS.DETAILS]: 'Address and tax details',
  [CUSTOMER_STEP_NUMBERS.REVIEW]: 'Documents and review',
} as const;

/** Step titles for review display, in the app's language. Call it while rendering. */
export function getCustomerStepTitles(): Record<1 | 2 | 3, string> {
  return {
    [CUSTOMER_STEP_NUMBERS.BASIC]: t('validation.steps.customer.basic'),
    [CUSTOMER_STEP_NUMBERS.DETAILS]: t('validation.steps.customer.details'),
    [CUSTOMER_STEP_NUMBERS.REVIEW]: t('validation.steps.customer.review'),
  };
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
