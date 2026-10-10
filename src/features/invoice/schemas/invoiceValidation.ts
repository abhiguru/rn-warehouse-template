import * as yup from 'yup';
import { createStepValidator, type ValidationResult } from '@/utils/validationHelpers';
import { t, type TranslationKey, type TranslationParams } from '@/i18n';

/**
 * A message that is read when validation fails, not when this file is loaded,
 * so it follows the app's language (docs/I18N.md rule 2). Each message is a
 * whole sentence of its own; the shared field helpers in validationHelpers
 * build theirs from an English field name, so they are not used here.
 */
const msg = (key: TranslationKey, params?: TranslationParams) => () => t(key, params);

/** A required amount of money from 0 to 999999.99. */
const moneyField = (messages: { negative: TranslationKey; tooLarge: TranslationKey; required: TranslationKey }) =>
  yup
    .number()
    .min(0, msg(messages.negative))
    .max(999999.99, msg(messages.tooLarge))
    .required(msg(messages.required));

// Step 1: Invoice Header Schema
export const step1Schema = yup.object().shape({
  inv_date: yup
    .date()
    .required(msg('invoice.validation.invoiceDateRequired'))
    .max(new Date(), msg('invoice.validation.futureDate')),

  inv_fin_year: yup
    .string()
    .required(msg('invoice.validation.financialYearRequired'))
    .matches(/^\d{4}-\d{2}$/, msg('invoice.validation.financialYearFormat', { example: '2025-26' })),

  inv_no: yup
    .number()
    .required(msg('invoice.validation.invoiceNumberRequired'))
    .positive(msg('invoice.validation.invoiceNumberPositive'))
    .integer(msg('invoice.validation.invoiceNumberWhole'))
    .min(1, msg('invoice.validation.invoiceNumberMin')),

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

// Step 3: Full Invoice Schema (for final validation)
export const fullInvoiceSchema = yup.object().shape({
  header: step1Schema.concat(
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
        .required(msg('invoice.validation.totalRequired'))
        .positive(msg('invoice.validation.totalPositive')),
    })
  ),
  items: step2Schema.fields.items,
});

// ============================================================================
// VALIDATION HELPERS (using createStepValidator factory - J16 fix)
// ============================================================================

export const validateStep1 = createStepValidator(step1Schema);

export const validateStep2 = async (data: unknown): Promise<ValidationResult> => {
  // Step2 wraps data in { items: ... } structure
  return createStepValidator(step2Schema)({ items: data });
};

export const validateStep3 = createStepValidator(fullInvoiceSchema);

export const validateFullInvoice = createStepValidator(fullInvoiceSchema);

export const validateItemPricing = createStepValidator(itemPricingSchema);
