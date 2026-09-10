/**
 * Dispatch Form Validation Schemas
 * Uses Yup for form validation across all 3 steps
 */

import * as yup from 'yup';

// ============================================================================
// STEP 1: HEADER SCHEMA
// ============================================================================

export const step1Schema = yup.object().shape({
  disp_no: yup
    .string()
    .required('Dispatch number is required')
    .min(5, 'Dispatch number must be at least 5 characters')
    .max(15, 'Dispatch number must be at most 15 characters')
    .matches(/^[A-Z0-9]+$/, 'Dispatch number must be alphanumeric (uppercase)'),

  disp_date: yup
    .string()
    .required('Dispatch date is required')
    .test('valid-date', 'Invalid date format', (value) => {
      if (!value) return false;
      const date = new Date(value);
      return !isNaN(date.getTime());
    })
    .test('not-future', 'Cannot select a future date', (value) => {
      if (!value) return true;
      const date = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      return date <= today;
    }),

  registration: yup
    .string()
    .required('Vehicle registration is required')
    .max(30, 'Registration must be at most 30 characters')
    .matches(/^[A-Z0-9 ]+$/, 'Registration must contain only uppercase letters, numbers, and spaces'),

  customer_id: yup
    .string()
    .uuid('Invalid customer selection')
    .required('Customer is required'),

  customer_name: yup
    .string()
    .required('Customer name is required')
    .max(100, 'Customer name must be at most 100 characters'),

  supervisor_id: yup
    .string()
    .uuid('Invalid supervisor selection')
    .required('Supervisor is required'),

  supervisor_name: yup
    .string()
    .required('Supervisor name is required')
    .max(100, 'Supervisor name must be at most 100 characters'),

  note: yup
    .string()
    .max(250, 'Note must be at most 250 characters'),
});

// ============================================================================
// STEP 2: ITEM SCHEMA
// ============================================================================

export const dispatchItemSchema = yup.object().shape({
  // GRN Header reference
  grns_gr_no: yup
    .string()
    .required('GRN number is required'),

  grns_id: yup
    .string()
    .uuid('Invalid GRN selection')
    .required('GRN ID is required'),

  grns_date: yup
    .string()
    .required('GRN date is required'),

  // GRN Item (lot) reference
  grnItems_id: yup
    .string()
    .uuid('Invalid lot selection')
    .required('Please select a lot'),

  grnItems_item_id: yup
    .string()
    .uuid('Invalid item selection')
    .required('Please select an item'),

  grnItems_item_name: yup
    .string()
    .required('Item name is required')
    .max(100, 'Item name must be at most 100 characters'),

  grnItems_stock: yup
    .number()
    .required('Stock information is required')
    .min(0, 'Stock cannot be negative')
    .integer('Stock must be a whole number'),

  // Dispatch quantity validation
  disp_quantity: yup
    .number()
    .required('Dispatch quantity is required')
    .positive('Quantity must be positive')
    .integer('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .test(
      'max-stock',
      'Quantity cannot exceed available stock',
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
    .min(1, 'At least one dispatch item is required')
    .required('Items are required')
    .test(
      'unique-lots',
      'Duplicate lots detected. Each lot can only be dispatched once per dispatch.',
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
    const formatDate = (date: Date) => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const dispDateFormatted = formatDate(dispDate);

    // Build user-friendly error message
    let errorMessage: string;
    if (invalidItems.length === 1) {
      const item = invalidItems[0];
      errorMessage = `GRN ${item.grNo} was received on ${formatDate(item.grnDate)}, which is after the dispatch date (${dispDateFormatted}). Items cannot be dispatched before they are received.`;
    } else {
      const grnList = invalidItems.map(i => `${i.grNo} (${formatDate(i.grnDate)})`).join(', ');
      errorMessage = `The following GRNs have dates after the dispatch date (${dispDateFormatted}): ${grnList}. Items cannot be dispatched before they are received.`;
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
        if (err.path) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _error: 'Validation failed' } };
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

  if (data?.items?.length > 0) {
    console.log('[dispatchValidation] First item:', JSON.stringify(data.items[0], null, 2));
  }

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
        if (err.path) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    console.log('[dispatchValidation] Non-Yup error:', error);
    return { isValid: false, errors: { _error: 'Validation failed' } };
  }
};

/**
 * Validate Step 3 data (complete form with cross-validation)
 */
export const validateStep3 = async (data: {
  header: any;
  items: any[];
}): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  console.log('[validateStep3] 🔍 Called with header:', JSON.stringify(data.header, null, 2));
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
          disp_date: dateValidation.error || 'Invalid dispatch date',
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
        if (err.path) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    console.log('[validateStep3] ❌ Non-Yup error:', error);
    return { isValid: false, errors: { _error: 'Validation failed' } };
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
        if (err.path) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _error: 'Validation failed' } };
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
