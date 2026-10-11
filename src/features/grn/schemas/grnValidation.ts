import * as yup from 'yup';
import { normalizeDigits, t, type TranslationKey } from '@/i18n';

/**
 * A yup message resolved when the error is reported, not when this file is
 * loaded, so it follows the app's language (docs/I18N.md rule 2).
 */
const msg = (key: TranslationKey) => () => t(key);

// Step 1: GRN Header Schema
export const step1Schema = yup.object().shape({
  // Empty is allowed: the number is then generated on save. The column holds
  // eight characters, and "G0001 " must not be stored next to "G0001".
  gr_no: yup
    .string()
    .max(8, msg('grn.validation.numberMax'))
    .matches(/^\S*$/, msg('grn.validation.numberNoSpaces')),

  registration: yup
    .string()
    .max(12, msg('grn.validation.registrationMax')),

  // "Today" is worked out when the form is checked. A limit fixed when this
  // file is loaded would reject today's receipts once the app has been open
  // past midnight.
  date: yup
    .date()
    .required(msg('grn.validation.dateRequired'))
    .test('not-future', msg('grn.validation.dateFuture'), (value) => {
      if (!value) return true;
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      return value <= endOfToday;
    }),

  sender_name: yup
    .string()
    .required(msg('grn.validation.senderRequired'))
    .max(200, msg('grn.validation.senderMax')),

  customer_id: yup
    .string()
    .uuid(msg('grn.validation.customerInvalid'))
    .required(msg('grn.validation.customerRequired')),

  customer_name: yup
    .string()
    .required(msg('grn.validation.customerRequired'))
    .max(200, msg('grn.validation.customerNameMax')),

  supervisor_id: yup
    .string()
    .uuid(msg('grn.validation.supervisorInvalid'))
    .required(msg('grn.validation.supervisorRequired')),

  supervisor_name: yup
    .string()
    .required(msg('grn.validation.supervisorRequired'))
    .max(30, msg('grn.validation.supervisorNameMax')),

  note: yup
    .string()
    .max(280, msg('grn.validation.noteMax')),

  leon: yup
    .boolean(),

  pricing_mode: yup
    .string()
    .oneOf(['ONE_TIME', 'MONTHLY'], msg('grn.validation.pricingModeInvalid'))
    .required(msg('grn.validation.pricingModeRequired')),

  gr_image_urls: yup
    .array()
    .of(yup.string().test('valid-uri', msg('grn.validation.imageUrlInvalid'), (value) => {
      if (!value) return true; // Allow empty values
      // Allow http/https URLs and local file URIs
      return /^(https?:\/\/|file:\/\/\/)/.test(value);
    }))
    .max(10, msg('grn.validation.imagesMax')),
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
 * text must be one to nine digits (0-9, or ૦-૯ which mean the same). No sign,
 * exponent, radix prefix, separator, decimal point or inner whitespace.
 * Returns null for anything else.
 */
export const parseWholeNumberInput = (text: string): number | null => {
  if (typeof text !== 'string') return null;
  const trimmed = normalizeDigits(text.trim());
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
  .typeError(msg('grn.validation.quantityWhole'))
  .required(msg('grn.validation.quantityRequired'))
  .integer(msg('grn.validation.quantityWhole'))
  .min(1, msg('grn.validation.quantityMin'))
  .max(WHOLE_NUMBER_MAX, msg('grn.validation.quantityMax'));

export const receiptStockSchema = yup
  .number()
  .transform(wholeNumberTransform)
  .typeError(msg('grn.validation.stockWhole'))
  .required(msg('grn.validation.stockRequired'))
  .integer(msg('grn.validation.stockWhole'))
  .min(0, msg('grn.validation.stockNegative'))
  .max(yup.ref('qty'), msg('grn.validation.stockExceeds'));

export const receiptWeightSchema = yup
  .number()
  .transform(wholeNumberTransform)
  .typeError(msg('grn.validation.weightWhole'))
  .integer(msg('grn.validation.weightWhole'))
  .min(0, msg('grn.validation.weightNegative'))
  .max(WHOLE_NUMBER_MAX, msg('grn.validation.weightMax'));

export const isValidReceiptQuantity = (value: string): boolean =>
  parseReceiptQuantity(value) !== null;

// Step 2: Items Schema
export const itemSchema = yup.object().shape({
  item_table_id: yup
    .string()
    .uuid(msg('grn.validation.itemInvalid'))
    .required(msg('grn.validation.itemSelectRequired')),

  item_name: yup
    .string()
    .required(msg('grn.validation.itemNameRequired'))
    .max(30, msg('grn.validation.itemNameMax')),

  packaging: yup
    .string()
    .max(20, msg('grn.validation.packagingMax')),

  qty: receiptQuantitySchema,

  stock: receiptStockSchema,

  weight: receiptWeightSchema,

  // A rack is free text: every facility writes its racks its own way. Only the
  // length is checked, because the server column holds 30 characters.
  rack: yup
    .string()
    .max(30, msg('grn.validation.rackMax')),

  package_mark: yup
    .string()
    .max(60, msg('grn.validation.packageMarkMax')),

  trl_img_url: yup
    .string()
    .test('valid-uri', msg('grn.validation.imageUrlInvalid'), (value) => {
      if (!value) return true; // Allow empty values
      // Allow http/https URLs and local file URIs
      return /^(https?:\/\/|file:\/\/\/)/.test(value);
    }),
});

export const step2Schema = yup.object().shape({
  items: yup
    .array()
    .of(itemSchema)
    .min(1, msg('grn.validation.itemsMin'))
    .required(msg('grn.validation.itemsRequired')),
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
        if (err.path && (!(err.path in errors) || err.type === 'required')) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _error: t('grn.validation.failed') } };
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
        if (err.path && (!(err.path in errors) || err.type === 'required')) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _error: t('grn.validation.failed') } };
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
        if (err.path && (!(err.path in errors) || err.type === 'required')) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _error: t('grn.validation.failed') } };
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
        if (err.path && (!(err.path in errors) || err.type === 'required')) {
          errors[err.path] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    return { isValid: false, errors: { _error: t('grn.validation.failed') } };
  }
};