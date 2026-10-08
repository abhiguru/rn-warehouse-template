import type { StepConfig } from '@/components/StepIndicator';

export const INVOICE_STEPS: StepConfig[] = [
  { number: 1, label: 'Header', shortLabel: 'Info' },
  { number: 2, label: 'Items', shortLabel: 'Items' },
  { number: 3, label: 'Review', shortLabel: 'Review' },
];

export const STEP_NUMBERS = {
  HEADER: 1,
  ITEMS: 2,
  REVIEW: 3,
} as const;

export function getCompletedSteps(currentStep: number): number[] {
  const completed: number[] = [];
  for (let i = 1; i < currentStep; i++) {
    completed.push(i);
  }
  return completed;
}
