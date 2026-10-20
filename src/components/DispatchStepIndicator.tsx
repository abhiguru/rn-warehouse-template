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
import { t } from '@/i18n';

/**
 * The wizard's steps with their names in the app's language. The names live in
 * the `dispatch.steps` texts, by step id (1 details, 2 items, 3 review), in the
 * same order as DISPATCH_STEP_NUMBERS in src/constants/dispatchSteps.ts. Call it while
 * rendering (docs/I18N.md rule 2).
 */
export const dispatchSteps = (): StepConfig[] => [
  { label: t('dispatch.steps.details'), shortLabel: t('dispatch.steps.detailsShort') },
  { label: t('dispatch.steps.items'), shortLabel: t('dispatch.steps.itemsShort') },
  { label: t('dispatch.steps.review'), shortLabel: t('dispatch.steps.reviewShort') },
];

export interface DispatchStepIndicatorProps {
  steps: StepConfig[];
  currentStep: number;
  completedSteps: number[];
  onCancel: () => void;
  cancelMessage?: string;
  /** The question the X asks. Default: "Discard this dispatch?" in a new dispatch, "Cancel dispatch" in an edit. */
  cancelTitle?: string;
  dispNo?: string;
  onStepPress?: (stepNumber: number) => void;
  /** First step of a new dispatch: what the Android Back key does (see GenericStepIndicatorHeader). */
  backOnFirstStep?: GenericStepIndicatorHeaderProps['backOnFirstStep'];
  isEditMode?: boolean;
  /** The server is being asked what became of a request: the close button still asks, with `leaveWarning` (see GenericStepIndicatorHeader). */
  disabled?: boolean;
  leaveWarning?: string;
}

export const DispatchStepIndicator: React.FC<DispatchStepIndicatorProps> = ({
  steps,
  currentStep,
  completedSteps,
  onCancel,
  cancelMessage,
  cancelTitle,
  dispNo,
  onStepPress,
  backOnFirstStep,
  isEditMode = false,
  disabled = false,
  leaveWarning,
}) => {
  return (
    <GenericStepIndicatorHeader
      steps={steps}
      currentStep={currentStep}
      completedSteps={completedSteps}
      onCancel={onCancel}
      entity="dispatch"
      mode={isEditMode ? 'edit' : 'create'}
      entityName={isEditMode ? t('dispatch.wizard.editTitle') : t('dispatch.wizard.createTitle')}
      entityId={dispNo}
      cancelTitle={cancelTitle ?? (isEditMode ? t('dispatch.wizard.cancelDispatch') : t('dispatch.wizard.discardTitle'))}
      cancelMessage={cancelMessage}
      onStepPress={onStepPress}
      backOnFirstStep={backOnFirstStep}
      disabled={disabled}
      leaveWarning={leaveWarning}
    />
  );
};

export default DispatchStepIndicator;
