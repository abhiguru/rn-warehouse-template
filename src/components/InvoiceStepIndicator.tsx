/**
 * Invoice Step Indicator with integrated cancel button
 * Thin wrapper around GenericStepIndicatorHeader for Invoice forms
 */

import React from 'react';
import type { StepConfig } from '@/components/StepIndicator';
import { GenericStepIndicatorHeader } from './GenericStepIndicatorHeader';
import { t } from '@/i18n';

/**
 * The invoice wizard's steps, named in the app's language. Step names are nouns
 * (style guide §14.3). Call it while rendering, so the names follow the language.
 */
export const invoiceSteps = (): StepConfig[] => [
  { number: 1, label: t('invoice.steps.details'), shortLabel: t('invoice.steps.details') },
  { number: 2, label: t('invoice.steps.items'), shortLabel: t('invoice.steps.items') },
  { number: 3, label: t('invoice.steps.review'), shortLabel: t('invoice.steps.review') },
];

export interface InvoiceStepIndicatorProps {
  steps: StepConfig[];
  currentStep: number;
  completedSteps: number[];
  onCancel: () => void;
  cancelMessage?: string;
  onStepPress?: (stepNumber: number) => void;
  invoiceNo?: string | number;
  isEditMode?: boolean;
}

export const InvoiceStepIndicator: React.FC<InvoiceStepIndicatorProps> = ({
  steps,
  currentStep,
  completedSteps,
  onCancel,
  cancelMessage,
  onStepPress,
  invoiceNo,
  isEditMode = false,
}) => {
  // Document numbers read "Invoice 2026-0042" (style guide §12.3), so no "#".
  const displayInvoiceNo = invoiceNo ? String(invoiceNo) : undefined;

  return (
    <GenericStepIndicatorHeader
      steps={steps}
      currentStep={currentStep}
      completedSteps={completedSteps}
      onCancel={onCancel}
      entityName={isEditMode ? t('invoice.steps.editInvoice') : t('common.invoice')}
      entityId={displayInvoiceNo}
      cancelTitle={isEditMode ? t('invoice.steps.discardEditTitle') : t('invoice.steps.discardNewTitle')}
      cancelMessage={
        cancelMessage ??
        (isEditMode
          ? t('invoice.steps.discardEditMessage')
          : t('invoice.steps.discardNewMessage'))
      }
      onStepPress={onStepPress}
    />
  );
};

export default InvoiceStepIndicator;
