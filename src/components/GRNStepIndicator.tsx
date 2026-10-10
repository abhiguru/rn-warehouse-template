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
import { t as tr } from '@/i18n';

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
      entity="grn"
      mode={isEditMode ? 'edit' : 'create'}
      entityName={isEditMode ? tr('common.edit') : tr('common.grn')}
      entityId={grnNo}
      cancelTitle={isEditMode ? tr('grn.form.discardChangesTitle') : tr('grn.form.discardTitle')}
      cancelMessage={
        cancelMessage ??
        (isEditMode
          ? tr('grn.form.discardChangesMessage')
          : tr('grn.form.discardMessage'))
      }
      onStepPress={onStepPress}
    />
  );
};

export default GRNStepIndicator;
