import { validateStep1, validateStep2, validateStep3, withoutStoredNumberError } from '@/features/grn/schemas/grnValidation';

/**
 * The one way the GRN form is checked (step 1 Next, step 2 Next, Review's Save). In edit mode a stored number that fails
 * today's format does not stop the edit
 * (WH-230); Sender name and Supervisor are required on an edit as on a new GRN (WH-248); every caller goes through here so no path can miss a filter.
 */
export type GrnFormCheck = { isValid: boolean; errors: Record<string, string> };

export type GrnCheckScope = {
  isCreateMode: boolean;
  /** The server gives the number at send (WH-161): the box is empty on purpose, so "number required" does not apply. */
  numberPending?: boolean;
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

  if (scope.numberPending) {
    const errors = Object.fromEntries(Object.entries(result.errors).filter(([field]) => field !== 'gr_no'));
    result = { isValid: Object.keys(errors).length === 0, errors };
  }
  if (scope.isCreateMode) return result;
  return withoutStoredNumberError(result);
};
