/**
 * GRN Step Indicator with integrated cancel button - SAP Fiori Compliant
 * Thin wrapper around GenericStepIndicatorHeader for GRN forms
 */

import React from 'react';
import type { StepConfig } from '@/components/StepIndicator';
import {
  GenericStepIndicatorHeader,
  type GenericStepIndicatorHeaderProps,
} from './GenericStepIndicatorHeader';

export interface GRNStepIndicatorProps {
  steps: StepConfig[];
  currentStep: number;
  completedSteps: number[];
  onCancel: () => void;
  cancelMessage?: string;
  onStepPress?: (stepNumber: number) => void;
  grnNo?: string;
  isEditMode?: boolean;
}

export const GRNStepIndicator: React.FC<GRNStepIndicatorProps> = ({
  steps,
  currentStep,
  completedSteps,
  onCancel,
  cancelMessage,
  onStepPress,
  grnNo,
  isEditMode = false,
}) => {
  return (
    <GenericStepIndicatorHeader
      steps={steps}
      currentStep={currentStep}
      completedSteps={completedSteps}
      onCancel={onCancel}
      entityName={isEditMode ? 'Edit' : 'GRN'}
      entityId={grnNo}
      cancelTitle={isEditMode ? 'Cancel GRN Edit' : 'Cancel GRN Creation'}
      cancelMessage={cancelMessage}
      onStepPress={onStepPress}
      colorScheme="teal"
    />
  );
};

export default GRNStepIndicator;
