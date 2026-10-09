/**
 * Invoice Step Indicator with integrated cancel button
 * Thin wrapper around GenericStepIndicatorHeader for Invoice forms
 */

import React from 'react';
import type { StepConfig } from '@/components/StepIndicator';
import { GenericStepIndicatorHeader } from './GenericStepIndicatorHeader';

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
      entityName={isEditMode ? 'Edit invoice' : 'Invoice'}
      entityId={displayInvoiceNo}
      cancelTitle={isEditMode ? 'Discard changes to this invoice?' : 'Discard this invoice?'}
      cancelMessage={
        cancelMessage ??
        (isEditMode
          ? 'Your changes to this invoice will be lost.'
          : 'The details you entered for this invoice will be lost.')
      }
      onStepPress={onStepPress}
    />
  );
};

export default InvoiceStepIndicator;
