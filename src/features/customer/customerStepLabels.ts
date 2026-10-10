/**
 * Names of the customer form steps in the app's language.
 *
 * The step order and numbers live in src/constants/customerSteps.ts; the text
 * is looked up here by step id each time it is drawn, so it follows the language.
 */
import type { StepConfig } from '@/components/StepIndicator';
import { CUSTOMER_STEP_NUMBERS } from '@/constants/customerSteps';
import { t } from '@/i18n';

/** Steps for the step indicator, in order. Call while rendering. */
export const customerSteps = (): StepConfig[] => [
  { label: t('customers.steps.basic.label'), shortLabel: t('customers.steps.basic.shortLabel') },
  { label: t('customers.steps.details.label'), shortLabel: t('customers.steps.details.shortLabel') },
  { label: t('customers.steps.review.label'), shortLabel: t('customers.steps.review.shortLabel') },
];

/** Text of the button that leaves `currentStep`: the next step's name, or create/update on the last step. */
export function customerNextStepLabel(currentStep: number, isEditMode: boolean = false): string {
  if (currentStep >= CUSTOMER_STEP_NUMBERS.REVIEW) {
    return isEditMode ? t('customers.steps.updateCustomer') : t('customers.steps.createCustomer');
  }
  return currentStep === CUSTOMER_STEP_NUMBERS.BASIC ? t('customers.steps.details.next') : t('customers.steps.review.next');
}
