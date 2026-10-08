/**
 * Dispatch Step Indicator with integrated cancel button - SAP Fiori Compliant
 * Thin wrapper around GenericStepIndicatorHeader for Dispatch forms
 */

import React from 'react';
import type { StepConfig } from '@/components/StepIndicator';
import {
  GenericStepIndicatorHeader,
  type GenericStepIndicatorHeaderProps,
} from './GenericStepIndicatorHeader';

export interface DispatchStepIndicatorProps {
  steps: StepConfig[];
  currentStep: number;
  completedSteps: number[];
  onCancel: () => void;
  cancelMessage?: string;
  cancelTitle?: string;
  dispNo?: string;
  onStepPress?: (stepNumber: number) => void;
  isEditMode?: boolean;
}

export const DispatchStepIndicator: React.FC<DispatchStepIndicatorProps> = ({
  steps,
  currentStep,
  completedSteps,
  onCancel,
  cancelMessage,
  cancelTitle = 'Cancel Dispatch',
  dispNo,
  onStepPress,
  isEditMode = false,
}) => {
  return (
    <GenericStepIndicatorHeader
      steps={steps}
      currentStep={currentStep}
      completedSteps={completedSteps}
      onCancel={onCancel}
      entityName={isEditMode ? 'Edit' : 'Dispatch'}
      entityId={dispNo}
      cancelTitle={cancelTitle}
      cancelMessage={cancelMessage}
      onStepPress={onStepPress}
      colorScheme="teal"
    />
  );
};

export default DispatchStepIndicator;
