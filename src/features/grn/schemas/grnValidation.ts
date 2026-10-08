import * as yup from 'yup';

// Step 1: GRN Header Schema
export const step1Schema = yup.object().shape({
  registration: yup
    .string()
    .max(12, 'Registration must be at most 12 characters'),

  date: yup
    .date()
    .required('Date is required')
    .max(new Date(), 'Cannot select a future date'),

  sender_name: yup
    .string()
    .required('Sender name is required')
    .max(200, 'Sender name must be at most 200 characters'),

  customer_id: yup
    .string()
    .uuid('Invalid customer selection')
    .required('Customer is required'),

  customer_name: yup
    .string()
    .required('Customer name is required')
    .max(200, 'Customer name must be at most 200 characters'),

  supervisor_id: yup
    .string()
    .uuid('Invalid supervisor selection')
    .required('Supervisor is required'),

  supervisor_name: yup
    .string()
    .required('Supervisor name is required')
    .max(30, 'Supervisor name must be at most 30 characters'),

  note: yup
    .string()
    .max(280, 'Note must be at most 280 characters'),

  leon: yup
    .boolean(),

  pricing_mode: yup
    .string()
    .oneOf(['ONE_TIME', 'MONTHLY'], 'Invalid pricing mode')
    .required('Pricing mode is required'),

  gr_image_urls: yup
    .array()
    .of(yup.string().test('valid-uri', 'Invalid image URL', (value) => {
      if (!value) return true; // Allow empty values
      // Allow http/https URLs and local file URIs
      return /^(https?:\/\/|file:\/\/\/)/.test(value);
    }))
    .max(10, 'Maximum 10 images allowed'),
});

// ---------------------------------------------------------------------------
// Whole-number input parsing
//
// Quantities and weights are typed into text fields. `Number()`/`parseInt`
// silently accept signs, exponents, hex, separators and trailing garbage
// ('1e3', '0x10', '1 000', '12bags' -> 12). Receipt counts must be exactly the
// digits the operator typed, so every site parses through these helpers and
// the yup schemas transform through the same rule.
// ---------------------------------------------------------------------------

/** Largest whole number a receipt field accepts (nine digits). */
export const WHOLE_NUMBER_MAX = 999_999_999;

const WHOLE_NUMBER_PATTERN = /^\d{1,9}$/;

/**
 * Parse a typed whole number: surrounding whitespace is ignored, otherwise the
 * text must be one to nine ASCII digits. No sign, exponent, radix prefix,
 * separator, decimal point or inner whitespace. Returns null for anything else.
 */
export const parseWholeNumberInput = (text: string): number | null => {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!WHOLE_NUMBER_PATTERN.test(trimmed)) return null;
  return Number(trimmed);
};

/** A received quantity is a whole number of at least 1. */
export const parseReceiptQuantity = (text: string): number | null => {
  const value = parseWholeNumberInput(text);
  return value !== null && value >= 1 ? value : null;
};

/** A received weight is a whole number; 0 (no weight recorded) is allowed. */
export const parseReceiptWeight = (text: string): number | null =>
  parseWholeNumberInput(text);

/**
 * yup transform shared by the receipt number fields. Strings go through
 * `parseWholeNumberInput` (empty text becomes undefined so `required` reports
 * it); numbers must already be whole; anything else becomes NaN, which yup
 * reports through `typeError`.
 */
const wholeNumberTransform = (_value: unknown, originalValue: unknown): unknown => {
  if (originalValue === undefined || originalValue === null) return originalValue;
  if (typeof originalValue === 'number') {
    return Number.isInteger(originalValue) ? originalValue : NaN;
  }
  if (typeof originalValue === 'string') {
    if (originalValue.trim() === '') return undefined;
    return parseWholeNumberInput(originalValue) ?? NaN;
  }
  return NaN;
};

// Use the same rules for item admission and final schema validation.
export const receiptQuantitySchema = yup
  .number()
  .transform(wholeNumberTransform)
  .typeError('Quantity must be a whole number')
  .required('Quantity is required')
  .integer('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1')
  .max(WHOLE_NUMBER_MAX, 'Quantity must be at most 999,999,999');

export const receiptStockSchema = yup
  .number()
  .transform(wholeNumberTransform)
  .typeError('Stock must be a whole number')
  .required('Stock is required')
  .integer('Stock must be a whole number')
  .min(0, 'Stock cannot be negative')
  .max(yup.ref('qty'), 'Stock cannot exceed the received quantity');

export const receiptWeightSchema = yup
  .number()
  .transform(wholeNumberTransform)
  .typeError('Weight must be a whole number')
  .integer('Weight must be a whole number')
  .min(0, 'Weight cannot be negative')
  .max(WHOLE_NUMBER_MAX, 'Weight must be at most 999,999,999');

export const isValidReceiptQuantity = (value: string): boolean =>
  parseReceiptQuantity(value) !== null;

// Step 2: Items Schema
export const itemSchema = yup.object().shape({
  item_table_id: yup
    .string()
    .uuid('Invalid item selection')
    .required('Please select an item from the catalog'),

  item_name: yup
    .string()
    .required('Item name is required')
    .max(30, 'Item name must be at most 30 characters'),

  packaging: yup
    .string()
    .max(20, 'Packaging must be at most 20 characters'),

  qty: receiptQuantitySchema,

  stock: receiptStockSchema,

  weight: receiptWeightSchema,

  rack: yup
    .string()
    .max(30, 'Rack must be at most 30 characters')
    .test(
      'valid-rack-format',
      'Rack must be in format: Floor/Chamber or Rack/Floor/Chamber',
      function (value) {
        // Empty rack is valid (optional field)
        if (!value || value.trim() === '') return true;

        // Allow two formats:
        // 1. floor/chamber only: e.g., "F1/C4", "BASE/Anti-Ch"
        // 2. rack/floor/chamber: e.g., "20B/F1/C4", "20B-20C/BASE/C7"
        const floorChamberOnlyPattern = /^(BASE|F1|F2|F3|F4)\/(C4|C7|C2|Anti-Ch)$/;
        const fullPattern = /^.+\/(BASE|F1|F2|F3|F4)\/(C4|C7|C2|Anti-Ch)$/;

        if (!floorChamberOnlyPattern.test(value) && !fullPattern.test(value)) {
          return this.createError({
            message: 'Rack must be in format: Floor/Chamber or Rack/Floor/Chamber with valid Floor (BASE, F1-F4) and Chamber (C4, C7, C2, Anti-Ch)',
          });
        }

        return true;
      }
    ),

  package_mark: yup
    .string()
    .max(60, 'Package mark must be at most 60 characters'),

  trl_img_url: yup
    .string()
    .test('valid-uri', 'Invalid image URL', (value) => {
      if (!value) return true; // Allow empty values
      // Allow http/https URLs and local file URIs
      return /^(https?:\/\/|file:\/\/\/)/.test(value);
    }),
});

export const step2Schema = yup.object().shape({
  items: yup
    .array()
    .of(itemSchema)
    .min(1, 'At least one item is required')
    .required('Items are required'),
});

// Combined schema for full validation
export const fullGRNSchema = yup.object().shape({
  header: step1Schema,
  items: step2Schema.fields.items,
});

// Validation helpers
export const validateStep1 = async (data: any): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
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

export const validateStep2 = async (data: any): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  try {
    await step2Schema.validate(data, { abortEarly: false });
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

export const validateStep3 = async (data: any): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  try {
    await fullGRNSchema.validate(data, { abortEarly: false });
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

export const validateFullGRN = async (data: any): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
  try {
    await fullGRNSchema.validate(data, { abortEarly: false });
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