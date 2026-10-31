import * as yup from 'yup';
import { createStepValidator, type ValidationResult } from '@/utils/validationHelpers';
import { t, type TranslationKey, type TranslationParams } from '@/i18n';
import { isZeroChargeLine } from '@/utils/invoiceCalculations';
import { formatDate } from '@/utils/formatters';

/**
 * A message that is read when validation fails, not when this file is loaded,
 * so it follows the app's language (docs/I18N.md rule 2). Each message is a
 * whole sentence of its own; the shared field helpers in validationHelpers
 * build theirs from an English field name, so they are not used here.
 */
const msg = (key: TranslationKey, params?: TranslationParams) => () => t(key, params);

/**
 * A required line rate from 0 to 999999, the range the server accepts (backend migration 41). This is what Next and Save
 * check, so a stored rate or a saved invoice above 9999.99 still passes. Entry on Items is limited to 9999.99 for
 * Charge by the owner's decision of 2026-10-19 (`RATE_MAX.charge`), not here.
 */
const moneyField = (messages: { negative: TranslationKey; tooLarge: TranslationKey; required: TranslationKey }) =>
  yup
    .number()
    .min(0, msg(messages.negative))
    .max(999999, msg(messages.tooLarge))
    .required(msg(messages.required));

/**
 * The largest number a new invoice may have: the server refuses a save outside
 * 1 to 99999999 with WH422 (backend migration 73). One invoice numbered
 * 2147483647, typed by hand, had made every later invoice of its financial
 * year fail. The number field of a new invoice takes this many digits.
 */
export const INVOICE_NUMBER_MAX = 99999999;
export const INVOICE_NUMBER_DIGITS = String(INVOICE_NUMBER_MAX).length;

const invoiceNumberField = () =>
  yup
    .number()
    .required(msg('invoice.validation.invoiceNumberRequired'))
    .positive(msg('invoice.validation.invoiceNumberPositive'))
    .integer(msg('invoice.validation.invoiceNumberWhole'))
    .min(1, msg('invoice.validation.invoiceNumberMin'));

// Step 1: Invoice Header Schema
export const step1Schema = yup.object().shape({
  // "Today" is worked out when the form is checked. A limit fixed when this
  // file is loaded would reject today's invoices once the app has been open
  // past midnight.
  inv_date: yup
    .date()
    .required(msg('invoice.validation.invoiceDateRequired'))
    .test('not-future', () => t('invoice.validation.futureDate', { today: formatDate(new Date()) }), (value) => {
      if (!value) return true;
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      return value <= endOfToday;
    }),

  inv_fin_year: yup
    .string()
    .required(msg('invoice.validation.financialYearRequired')),

  inv_no: invoiceNumberField(),

  gr_id: yup.string().uuid(msg('invoice.validation.grnInvalid')).required(msg('invoice.validation.grnRequired')),

  gr_no: yup.string().required(msg('invoice.validation.grnNumberRequired')),

  customer_id: yup
    .string()
    .uuid(msg('invoice.validation.customerInvalid'))
    .required(msg('invoice.validation.customerRequired')),

  customer_name: yup
    .string()
    .required(msg('invoice.validation.customerRequired'))
    .max(200, msg('invoice.validation.customerNameTooLong')),

  one_time_charge: yup.boolean().required(msg('invoice.validation.oneTimeChargeRequired')),

  // Discount can be negative (acts as a surcharge when negative)
  discount: yup
    .number()
    .max(999999.99, msg('invoice.validation.discountTooLarge'))
    .min(-999999.99, msg('invoice.validation.discountTooSmall')),
});

// Step 2: Invoice Items Schema
export const itemPricingSchema = yup.object().shape({
  duration: yup
    .number()
    .required(msg('invoice.validation.durationRequired'))
    .positive(msg('invoice.validation.durationPositive'))
    .min(0.5, msg('invoice.validation.durationMin')),

  no_of_days: yup
    .number()
    .required(msg('invoice.validation.daysRequired'))
    .integer(msg('invoice.validation.daysWhole'))
    .min(0, msg('invoice.validation.daysNegative')),

  charge: moneyField({
    negative: 'invoice.validation.chargeNegative',
    tooLarge: 'invoice.validation.chargeTooLarge',
    required: 'invoice.validation.chargeRequired',
  }),

  labour_rate: moneyField({
    negative: 'invoice.validation.labourRateNegative',
    tooLarge: 'invoice.validation.labourRateTooLarge',
    required: 'invoice.validation.labourRateRequired',
  }),

  tax: yup
    .number()
    .required(msg('invoice.validation.taxRequired'))
    .min(0, msg('invoice.validation.taxNegative'))
    .max(100, msg('invoice.validation.taxTooHigh')),
});

export const step2Schema = yup.object().shape({
  items: yup
    .array()
    .of(
      yup.object().shape({
        temp_id: yup.string().required(),
        disp_trl_id: yup.string().uuid().required(),
        qty: yup.number().positive().required(),
        duration: itemPricingSchema.fields.duration,
        no_of_days: itemPricingSchema.fields.no_of_days,
        charge: itemPricingSchema.fields.charge,
        labour_rate: itemPricingSchema.fields.labour_rate,
        tax: itemPricingSchema.fields.tax,
      })
    )
    .min(1, msg('invoice.validation.itemsMin'))
    .required(msg('invoice.validation.itemsRequired')),
});

/**
 * Step 1 of a new invoice: the number also has the server's ceiling. An edit
 * keeps the checks of step1Schema, because the server lets an invoice saved
 * before the ceiling keep its larger number (it refuses only a change to
 * another number outside the range, and that refusal is shown as this message).
 */
export const newInvoiceStep1Schema = step1Schema.shape({
  inv_no: invoiceNumberField().max(INVOICE_NUMBER_MAX, msg('invoice.validation.invoiceNumberRange')),
});

// Step 3: Full Invoice Schema (for final validation)
// The total must be more than 0, with one exception: an invoice on which
// nothing is charged (every line has a charge of 0, allowed since the owner
// decision of 2026-10-11, and there is no labour) comes to exactly 0 and may be
// saved. That is a total of 0 before any discount. A charged invoice that a
// discount takes down to 0 is refused as before, also when one of its lines is
// free.
const fullSchemaWith = (header: typeof step1Schema, items: yup.Schema = step2Schema.fields.items as yup.Schema) => yup.object().shape({
  header: header.concat(
    yup.object().shape({
      labour: yup
        .number()
        .required(msg('invoice.validation.labourTotalRequired'))
        .min(0, msg('invoice.validation.labourNegative')),
      tax_amount: yup
        .number()
        .required(msg('invoice.validation.taxAmountRequired'))
        .min(0, msg('invoice.validation.taxAmountNegative')),
      total: yup
        .number()
        .required(msg('invoice.validation.totalRequired')),
    })
  ),
  items,
}).test('total-positive', function (value) {
  const total = Number(value?.header?.total);
  // A missing or unreadable total is reported by the field itself.
  if (Number.isNaN(total) || total > 0) return true;
  const lines = Array.isArray(value?.items) ? (value.items as { charge?: number | null }[]) : [];
  const discount = Number(value?.header?.discount) || 0;
  const nothingCharged = lines.length > 0 && lines.every(isZeroChargeLine) && discount === 0;
  if (total === 0 && nothingCharged) return true;
  return this.createError({ path: 'header.total', message: t('invoice.validation.totalPositive') });
});

export const fullInvoiceSchema = fullSchemaWith(step1Schema);

/** The whole of a new invoice, with the ceiling on its number. */
export const newInvoiceSchema = fullSchemaWith(newInvoiceStep1Schema);

// ============================================================================
// VALIDATION HELPERS (using createStepValidator factory - J16 fix)
// ============================================================================

export const validateStep1 = createStepValidator(step1Schema);

const validateStep2Full = createStepValidator(step2Schema);

/**
 * The schema of each field of a line, taken from step2Schema itself so that no
 * rule is copied. The line schema is a plain object of independent fields: no
 * `when`, `ref`, sibling test, object-level test or `noUnknown`. So a field
 * of a line in the list passes exactly when `field.isValidSync(value)` does.
 */
const LINE_FIELD_SCHEMAS = Object.entries(
  (step2Schema.fields.items as unknown as { innerType: yup.ObjectSchema<yup.AnyObject> }).innerType.fields
) as [string, yup.Schema][];

/**
 * Whether the per-field check is a faithful stand-in for the schema (yup 1.7.1). The line schema has no object-level
 * test, transform, condition, dependency or valid/invalid list of its own, is not strict and strips nothing; no
 * field of a line has a condition, a dependency or `strip`; and the `items` array has exactly the checks the fast path
 * repeats by hand: `min(1)` (a `tests` entry named min with value 1) and `required` (internalTests nullable and
 * optionality, spec nullable/optional false), with no transform, condition or strict of its own. Worked out once, when
 * this file loads, and never throws: if the schema cannot be read, or has changed, the fast path is off and the full
 * check runs (in development a warning says so).
 */
const LINE_FAST_PATH_OK: boolean = (() => {
  const ok = ((): boolean => {
    try {
      const itemsSchema = step2Schema.fields.items as unknown as {
        innerType: yup.ObjectSchema<yup.AnyObject>;
        tests: { OPTIONS?: { name?: string; params?: { min?: unknown } } }[];
        internalTests: Record<string, unknown>;
        transforms: unknown[];
        conditions: unknown[];
        spec: { strict?: boolean; strip?: boolean; nullable?: boolean; optional?: boolean };
      };
      const line = itemsSchema.innerType;
      const internals = line as unknown as {
        tests: unknown[];
        transforms: unknown[];
        conditions: unknown[];
        deps: unknown[];
        spec: { strict?: boolean };
        _whitelist: { size: number };
        _blacklist: { size: number };
      };
      if (!Array.isArray(internals.tests) || internals.tests.length > 0) return false;
      if (!Array.isArray(internals.transforms) || internals.transforms.length > 0) return false;
      if (!Array.isArray(internals.conditions) || internals.conditions.length > 0) return false;
      if (!Array.isArray(internals.deps) || internals.deps.length > 0) return false;
      if (internals.spec?.strict !== false) return false;
      if (internals._whitelist?.size !== 0 || internals._blacklist?.size !== 0) return false;
      // The items array: exactly min(1) and required.
      if (!Array.isArray(itemsSchema.tests) || itemsSchema.tests.length !== 1) return false;
      const minTest = itemsSchema.tests[0]?.OPTIONS;
      if (minTest?.name !== 'min' || minTest.params?.min !== 1) return false;
      if (!itemsSchema.internalTests?.nullable || !itemsSchema.internalTests?.optionality) return false;
      if (itemsSchema.spec?.nullable !== false || itemsSchema.spec?.optional !== false) return false;
      if (!Array.isArray(itemsSchema.transforms) || itemsSchema.transforms.length > 0) return false;
      if (!Array.isArray(itemsSchema.conditions) || itemsSchema.conditions.length > 0) return false;
      if (itemsSchema.spec?.strict !== false) return false;
      return LINE_FIELD_SCHEMAS.every(([, schema]) => {
        const field = schema as unknown as { conditions: unknown[]; deps: unknown[]; spec: { strip?: boolean } };
        return (
          Array.isArray(field.conditions) &&
          field.conditions.length === 0 &&
          Array.isArray(field.deps) &&
          field.deps.length === 0 &&
          !field.spec?.strip
        );
      });
    } catch {
      return false;
    }
  })();
  if (!ok && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn('invoiceValidation: the per-line fast path is off (the lines schema no longer matches what it repeats); the full check runs.');
  }
  return ok;
})();

/** A token of the type and value of a plain primitive, or null for anything else. */
const primitiveToken = (value: unknown): string | null => {
  if (value === null) return 'n';
  const type = typeof value;
  if (type === 'undefined') return 'u';
  if (type === 'string') return `s${value as string}`;
  if (type === 'number') return Object.is(value, -0) ? 'd-0' : `d${value as number}`;
  if (type === 'boolean') return `b${value as boolean}`;
  return null;
};

/**
 * True only when `lines` is a non-empty array (no holes) of plain objects and
 * every distinct value of every line field passes its own schema. False means
 * "not proven valid": the caller then runs the full check.
 */
const linesPassPerField = (lines: unknown, chargeMustBeNumber = false): boolean => {
  if (!LINE_FAST_PATH_OK) return false;
  try {
    return checkLinesPerField(lines, chargeMustBeNumber);
  } catch {
    // Not proven valid: the caller runs the full check.
    return false;
  }
};

const checkLinesPerField = (lines: unknown, chargeMustBeNumber: boolean): boolean => {
  if (!Array.isArray(lines) || lines.length === 0) return false;
  const seen = LINE_FIELD_SCHEMAS.map(() => new Map<string, boolean>());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A plain object only (this also leaves out null and arrays): yup rejects any other kind of object.
    if (!(i in lines) || Object.prototype.toString.call(line) !== '[object Object]') return false;
    const record = line as Record<string, unknown>;
    if (chargeMustBeNumber && typeof record.charge !== 'number') return false;
    for (let f = 0; f < LINE_FIELD_SCHEMAS.length; f++) {
      const [name, schema] = LINE_FIELD_SCHEMAS[f];
      const value = record[name];
      const token = primitiveToken(value);
      if (token === null) return false;
      let ok = seen[f].get(token);
      if (ok === undefined) {
        ok = schema.isValidSync(value);
        seen[f].set(token, ok);
      }
      if (!ok) return false;
    }
  }
  return true;
};

/**
 * Only for speed: an invoice can have thousands of lines (3,055 for one GRN
 * measured 660 ms) and almost all lines repeat the same values. Each field of a
 * line is checked once per distinct value, by the schema's own field schema. If
 * all pass, and the list is a non-empty array (min(1), required), the result is
 * the one the full check gives for a valid list. Anything else (a failing value,
 * an empty or odd list) runs the full check unchanged, so errors, paths and
 * messages are exactly what they always were.
 */
export const validateStep2 = async (data: unknown): Promise<ValidationResult> => {
  if (linesPassPerField(data)) return { isValid: true, errors: {} };
  // Step2 wraps data in { items: ... } structure
  return validateStep2Full({ items: data });
};

export const validateStep3 = createStepValidator(fullInvoiceSchema);

const validateFullInvoiceInFull = createStepValidator(fullInvoiceSchema);
const validateNewInvoiceInFull = createStepValidator(newInvoiceSchema);

/**
 * The same speed-up at Save: the header (and the total-positive rule, which
 * reads the lines' charges) is checked by the schema with a loose list, the
 * lines by linesPassPerField. A charge that is not a number, or any failure,
 * runs the full check unchanged.
 */
const withFastLines = (
  headerSchema: ReturnType<typeof fullSchemaWith>,
  full: (data: unknown) => Promise<ValidationResult>
) => async (data: unknown): Promise<ValidationResult> => {
  const items = data !== null && typeof data === 'object' ? (data as { items?: unknown }).items : undefined;
  if (linesPassPerField(items, true)) {
    try {
      await headerSchema.validate(data, { abortEarly: false });
      return { isValid: true, errors: {} };
    } catch {
      // Not proven valid: the full check gives the errors.
    }
  }
  return full(data);
};

export const validateFullInvoice = withFastLines(fullSchemaWith(step1Schema, yup.array()), validateFullInvoiceInFull);

/** Step 1 of a new invoice (the number has the server's ceiling). */
export const validateNewInvoiceStep1 = createStepValidator(newInvoiceStep1Schema);

/** The whole of a new invoice (the number has the server's ceiling). */
export const validateNewInvoice = withFastLines(
  fullSchemaWith(newInvoiceStep1Schema, yup.array()),
  validateNewInvoiceInFull
);

export const validateItemPricing = createStepValidator(itemPricingSchema);
