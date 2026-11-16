import { validateStep1, validateStep2, validateStep3, withoutStoredNumberError } from '@/features/grn/schemas/grnValidation';
import { withoutKeptEmptyErrors } from './keptEmptyHeader';

/**
 * The one way the GRN form is checked (step 1 Next, step 2 Next, Review's Save). In edit mode a stored number that fails
 * today's format and a Sender name / Supervisor that was empty at load and is still untouched do not stop the edit
 * (WH-230); every caller goes through here so no path can miss a filter.
 */
export type GrnFormCheck = { isValid: boolean; errors: Record<string, string> };

export type GrnCheckScope = {
  isCreateMode: boolean;
  loadedSenderEmpty: boolean;
  loadedSupervisorEmpty: boolean;
};

export const checkGrnForm = async (
  step: 1 | 2 | 3,
  data: { header: any; items: any[] },
  scope: GrnCheckScope
): Promise<GrnFormCheck> => {
  let result: GrnFormCheck;
  if (step === 1) result = await validateStep1(data.header);
  else if (step === 2) result = await validateStep2({ items: data.items }, { keepWeight: true });
  else result = await validateStep3({ header: data.header, items: data.items });

  if (scope.isCreateMode) return result;
  result = withoutStoredNumberError(result);
  return withoutKeptEmptyErrors(result, data.header, { sender: scope.loadedSenderEmpty, supervisor: scope.loadedSupervisorEmpty });
};
