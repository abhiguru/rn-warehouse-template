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
      cancelTitle={isEditMode ? 'Discard changes to this GRN?' : 'Discard this GRN?'}
      cancelMessage={
        cancelMessage ??
        (isEditMode
          ? 'Your changes to this GRN will be lost.'
          : 'The details you entered will be lost.')
      }
      onStepPress={onStepPress}
    />
  );
};

export default GRNStepIndicator;
