/**
 * Invoice Step Indicator with integrated cancel button
 * Thin wrapper around GenericStepIndicatorHeader for Invoice forms
 */

import React from 'react';
import type { StepConfig } from '@/components/StepIndicator';
import {
  GenericStepIndicatorHeader,
  type GenericStepIndicatorHeaderProps,
} from './GenericStepIndicatorHeader';

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
  // Format invoice number for display
  const displayInvoiceNo = invoiceNo ? `#${invoiceNo}` : undefined;

  return (
    <GenericStepIndicatorHeader
      steps={steps}
      currentStep={currentStep}
      completedSteps={completedSteps}
      onCancel={onCancel}
      entityName={isEditMode ? 'Edit Invoice' : 'Invoice'}
      entityId={displayInvoiceNo}
      cancelTitle={isEditMode ? 'Cancel Invoice Edit' : 'Cancel Invoice Creation'}
      cancelMessage={cancelMessage}
      colorScheme="blue"
      onStepPress={onStepPress}
    />
  );
};

export default InvoiceStepIndicator;
