/**
 * Dispatch Form Validation Schemas
 * Uses Yup for form validation across all 3 steps
 */

import * as yup from 'yup';
import { formatDate } from '@/utils/formatters';
import { t, type TranslationKey, formatIdentifier } from '@/i18n';
import { serverText } from '@/utils/serverText';

/**
 * A yup message read when the error is raised, not when this file is loaded, so
 * the schemas below can stay module-level constants and still follow the app's
 * language (docs/I18N.md rule 2).
 */
const m = (key: TranslationKey) => () => t(key);

// ============================================================================
// STEP 1: HEADER SCHEMA
// ============================================================================

export const step1Schema = yup.object().shape({
  disp_no: yup
    .string()
    .required(m('dispatch.validation.dispNoRequired'))
    .min(5, m('dispatch.validation.dispNoMin'))
    .max(8, m('dispatch.validation.dispNoMax'))
    .matches(/^[A-Z0-9]+$/, m('dispatch.validation.dispNoFormat')),

  disp_date: yup
    .string()
    .required(m('dispatch.validation.dateRequired'))
    .test('valid-date', m('dispatch.validation.dateInvalid'), (value) => {
      if (!value) return false;
      const date = new Date(value);
      return !isNaN(date.getTime());
    })
    .test('not-future', m('dispatch.validation.dateFuture'), (value) => {
      if (!value) return true;
      const date = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      return date <= today;
    }),

  registration: yup
    .string()
    .required(m('dispatch.validation.registrationRequired'))
    .max(30, m('dispatch.validation.registrationMax'))
    .matches(/^[A-Z0-9 ]+$/, m('dispatch.validation.registrationFormat')),

  customer_id: yup
    .string()
    .uuid(m('dispatch.validation.customerInvalid'))
    .required(m('dispatch.validation.customerRequired')),

  customer_name: yup
    .string()
    .required(m('dispatch.validation.customerRequired'))
    .max(100, m('dispatch.validation.customerNameMax')),

  supervisor_id: yup
    .string()
    .uuid(m('dispatch.validation.supervisorInvalid'))
    .required(m('dispatch.validation.supervisorRequired')),

  supervisor_name: yup
    .string()
    .required(m('dispatch.validation.supervisorRequired'))
    .max(100, m('dispatch.validation.supervisorNameMax')),

  note: yup
    .string()
    .max(250, m('dispatch.validation.noteMax')),
});

// ============================================================================
// STEP 2: ITEM SCHEMA
// ============================================================================

export const dispatchItemSchema = yup.object().shape({
  // GRN Header reference
  grns_gr_no: yup
    .string()
    .required(m('dispatch.validation.grnNumberRequired')),

  grns_id: yup
    .string()
    .uuid(m('dispatch.validation.grnInvalid'))
    .required(m('dispatch.validation.grnIdRequired')),

  grns_date: yup
    .string()
    .required(m('dispatch.validation.grnDateRequired')),

  // GRN Item (lot) reference
  grnItems_id: yup
    .string()
    .uuid(m('dispatch.validation.lotInvalid'))
    .required(m('dispatch.validation.lotRequired')),

  grnItems_item_id: yup
    .string()
    .uuid(m('dispatch.validation.itemInvalid'))
    .required(m('dispatch.validation.itemRequired')),

  grnItems_item_name: yup
    .string()
    .required(m('dispatch.validation.itemNameRequired'))
    .max(100, m('dispatch.validation.itemNameMax')),

  grnItems_stock: yup
    .number()
    .required(m('dispatch.validation.stockRequired'))
    .min(0, m('dispatch.validation.stockNegative'))
    .integer(m('dispatch.validation.stockWhole')),

  // Dispatch quantity validation
  disp_quantity: yup
    .number()
    .required(m('dispatch.validation.quantityRequired'))
    .positive(m('dispatch.validation.quantityPositive'))
    .integer(m('dispatch.validation.quantityWhole'))
    .min(1, m('dispatch.validation.quantityMin'))
    .test(
      'max-stock',
      m('dispatch.validation.quantityMaxStock'),
      function (value) {
        const { grnItems_stock, original_disp_quantity } = this.parent;
        // In edit mode (original_disp_quantity exists), effective stock = available + what we already hold
        const effectiveStock = (grnItems_stock || 0) + (original_disp_quantity || 0);

        if (!value) return true;
        return value <= effectiveStock;
      }
    ),

  // Read-only fields (for completeness)
  grnItems_quantity: yup.number(),
  grnItems_package_mark: yup.string(),
  grnItems_rack: yup.string(),
  grnItems_weight: yup.number(),
});

export const step2Schema = yup.object().shape({
  items: yup
    .array()
    .of(dispatchItemSchema)
    .min(1, m('dispatch.validation.itemsMin'))
    .required(m('dispatch.validation.itemsRequired'))
    .test(
      'unique-lots',
      m('dispatch.validation.duplicateLots'),
      function (items) {
        if (!items || items.length === 0) return true;

        const lotIds = items
          .map((item) => item.grnItems_id)
          .filter((id) => id); // Filter out empty IDs

        const uniqueLotIds = new Set(lotIds);
        return lotIds.length === uniqueLotIds.size;
      }
    ),
});

// ============================================================================
// STEP 3: FINAL VALIDATION SCHEMA
// ============================================================================

export const step3Schema = yup.object().shape({
  header: step1Schema,
  items: step2Schema.fields.items,
});

/**
 * Additional cross-validation for dispatch date vs GRN dates
 * This ensures dispatch date >= all GRN dates (no back-dating)
 */
export const validateDispatchDateVsGRNDates = (
  dispatchDate: string,
  items: Array<{ grns_date: string; grns_gr_no: string }>
): { isValid: boolean; error?: string; invalidGRNs?: string[] } => {
  console.log('[validateDispatchDateVsGRNDates] 🔍 Input dispatchDate:', dispatchDate, 'type:', typeof dispatchDate);
  console.log('[validateDispatchDateVsGRNDates] 🔍 Items count:', items?.length);

  if (!dispatchDate || !items || items.length === 0) {
    console.log('[validateDispatchDateVsGRNDates] 🔍 Early return - missing data');
    return { isValid: true };
  }

  const dispDate = new Date(dispatchDate);
  console.log('[validateDispatchDateVsGRNDates] 🔍 Parsed dispDate:', dispDate, 'isValid:', !isNaN(dispDate.getTime()));

  // Collect invalid items with their dates for better error messaging
  const invalidItems: Array<{ grNo: string; grnDate: Date }> = [];

  for (const item of items) {
    console.log('[validateDispatchDateVsGRNDates] 🔍 Checking item grns_date:', item.grns_date, 'grns_gr_no:', item.grns_gr_no);
    const grnDate = new Date(item.grns_date);
    console.log('[validateDispatchDateVsGRNDates] 🔍 Parsed grnDate:', grnDate, 'isValid:', !isNaN(grnDate.getTime()));
    console.log('[validateDispatchDateVsGRNDates] 🔍 Comparison: dispDate < grnDate?', dispDate < grnDate, `(${dispDate.getTime()} < ${grnDate.getTime()})`);
    if (dispDate < grnDate) {
      invalidItems.push({ grNo: item.grns_gr_no, grnDate });
    }
  }

  if (invalidItems.length > 0) {
    console.log('[validateDispatchDateVsGRNDates] ❌ Invalid GRNs found:', invalidItems.map(i => i.grNo));

    // Format dates for display
    const dispDateFormatted = formatDate(dispDate);

    // Build user-friendly error message
    let errorMessage: string;
    if (invalidItems.length === 1) {
      const item = invalidItems[0];
      errorMessage = t('dispatch.validation.dateBeforeGrn', {
        grn: formatIdentifier(item.grNo),
        grnDate: formatDate(item.grnDate),
        dispatchDate: dispDateFormatted,
      });
    } else {
      const grnList = invalidItems.map(i => `${i.grNo} (${formatDate(i.grnDate)})`).join(', ');
      errorMessage = t('dispatch.validation.dateBeforeGrns', { dispatchDate: dispDateFormatted, grns: grnList });
    }

    return {
      isValid: false,
      error: errorMessage,
      invalidGRNs: invalidItems.map(i => i.grNo),
    };
  }

  console.log('[validateDispatchDateVsGRNDates] ✅ Validation passed');
  return { isValid: true };
};

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

/**
 * Validate Step 1 data (header)
 */
export const validateStep1 = async (
  data: any
): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  try {
    await step1Schema.validate(data, { abortEarly: false });
    return { isValid: true, errors: {} };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      const errors: Record<string, string> = {};
      error.inner.forEach((err) => {
        if (err.path && (!(err.path in errors) || err.type === 'required')) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _error: t('dispatch.validation.failed') } };
  }
};

/**
 * Validate Step 2 data (items)
 */
export const validateStep2 = async (
  data: any
): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  console.log('[dispatchValidation] validateStep2 called');
  console.log('[dispatchValidation] Input data type:', typeof data);
  console.log('[dispatchValidation] Input data keys:', data ? Object.keys(data) : 'null/undefined');
  console.log('[dispatchValidation] Items array?:', Array.isArray(data?.items));
  console.log('[dispatchValidation] Items length:', data?.items?.length ?? 'N/A');

  try {
    await step2Schema.validate(data, { abortEarly: false });
    console.log('[dispatchValidation] validateStep2 PASSED');
    return { isValid: true, errors: {} };
  } catch (error) {
    console.log('[dispatchValidation] validateStep2 FAILED');
    if (error instanceof yup.ValidationError) {
      const errors: Record<string, string> = {};
      console.log('[dispatchValidation] Yup validation errors count:', error.inner.length);
      error.inner.forEach((err, index) => {
        console.log(`[dispatchValidation] Error ${index}: path="${err.path}", message="${err.message}"`);
        if (err.path && (!(err.path in errors) || err.type === 'required')) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    console.log('[dispatchValidation] Non-Yup error:', error);
    return { isValid: false, errors: { _error: t('dispatch.validation.failed') } };
  }
};

/**
 * Validate Step 3 data (complete form with cross-validation)
 */
export const validateStep3 = async (data: {
  header: any;
  items: any[];
}): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  console.log('[validateStep3] Validating complete form');
  console.log('[validateStep3] 🔍 header.disp_date:', data.header?.disp_date, 'type:', typeof data.header?.disp_date);
  console.log('[validateStep3] 🔍 Items count:', data.items?.length);

  try {
    // First, run schema validation
    console.log('[validateStep3] 🔍 Running step3Schema.validate...');
    await step3Schema.validate(data, { abortEarly: false });
    console.log('[validateStep3] ✅ Schema validation passed');

    // Then, run cross-validation for dispatch date vs GRN dates
    console.log('[validateStep3] 🔍 Running date cross-validation...');
    const dateValidation = validateDispatchDateVsGRNDates(
      data.header.disp_date,
      data.items
    );

    if (!dateValidation.isValid) {
      console.log('[validateStep3] ❌ Date cross-validation failed:', dateValidation.error);
      return {
        isValid: false,
        errors: {
          disp_date: serverText(dateValidation.error, t('dispatch.validation.dispatchDateInvalid')),
        },
      };
    }

    console.log('[validateStep3] ✅ All validations passed');
    return { isValid: true, errors: {} };
  } catch (error) {
    console.log('[validateStep3] ❌ Validation error caught');
    if (error instanceof yup.ValidationError) {
      const errors: Record<string, string> = {};
      console.log('[validateStep3] 🔍 Yup errors count:', error.inner.length);
      error.inner.forEach((err, index) => {
        console.log(`[validateStep3] 🔍 Error ${index}: path="${err.path}", message="${err.message}"`);
        if (err.path && (!(err.path in errors) || err.type === 'required')) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    console.log('[validateStep3] ❌ Non-Yup error:', error);
    return { isValid: false, errors: { _error: t('dispatch.validation.failed') } };
  }
};

/**
 * Validate a single dispatch item
 * Useful for real-time validation in Step 2
 */
export const validateSingleItem = async (
  item: any
): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  try {
    await dispatchItemSchema.validate(item, { abortEarly: false });
    return { isValid: true, errors: {} };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      const errors: Record<string, string> = {};
      error.inner.forEach((err) => {
        if (err.path && (!(err.path in errors) || err.type === 'required')) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _error: t('dispatch.validation.failed') } };
  }
};

/**
 * Check for duplicate lots across items
 */
export const checkDuplicateLots = (
  items: Array<{ grnItems_id: string }>
): { hasDuplicates: boolean; duplicateIds: string[] } => {
  const lotIds = items
    .map((item) => item.grnItems_id)
    .filter((id) => id);

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  lotIds.forEach((id) => {
    if (seen.has(id)) {
      duplicates.add(id);
    } else {
      seen.add(id);
    }
  });

  return {
    hasDuplicates: duplicates.size > 0,
    duplicateIds: Array.from(duplicates),
  };
};
