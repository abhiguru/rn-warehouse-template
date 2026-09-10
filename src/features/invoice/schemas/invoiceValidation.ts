import * as yup from 'yup';
import {
  pastDateField,
  requiredUuidField,
  requiredStringField,
  quantityField,
  percentageField,
  requiredMoneyField,
  createStepValidator,
  type ValidationResult,
} from '@/utils/validationHelpers';

// Step 1: Invoice Header Schema
export const step1Schema = yup.object().shape({
  inv_date: pastDateField('Invoice date'),

  inv_fin_year: yup
    .string()
    .required('Financial year is required')
    .matches(/^\d{4}-\d{2}$/, 'Invalid financial year format (e.g., 2025-26)'),

  inv_no: quantityField('Invoice number'),

  gr_id: requiredUuidField('GRN'),

  gr_no: yup.string().required('GRN number is required'),

  customer_id: requiredUuidField('Customer'),

  customer_name: requiredStringField('Customer name', 200),

  one_time_charge: yup.boolean().required('One-time charge flag is required'),

  // Discount can be negative (acts as a surcharge when negative)
  discount: yup
    .number()
    .max(999999.99, 'Discount is too large')
    .min(-999999.99, 'Discount is too small'),
});

// Step 2: Invoice Items Schema
export const itemPricingSchema = yup.object().shape({
  duration: yup
    .number()
    .required('Duration is required')
    .positive('Duration must be positive')
    .min(0.5, 'Duration must be at least 0.5 months'),

  no_of_days: yup
    .number()
    .required('Number of days is required')
    .integer('Days must be a whole number')
    .min(0, 'Days cannot be negative'),

  charge: requiredMoneyField('Charge'),

  labour_rate: requiredMoneyField('Labour rate'),

  tax: percentageField('Tax'),
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
    .min(1, 'At least one item is required')
    .required('Items are required'),
});

// Step 3: Full Invoice Schema (for final validation)
export const fullInvoiceSchema = yup.object().shape({
  header: step1Schema.concat(
    yup.object().shape({
      labour: yup
        .number()
        .required('Labour total is required')
        .min(0, 'Labour cannot be negative'),
      tax_amount: yup
        .number()
        .required('Tax amount is required')
        .min(0, 'Tax amount cannot be negative'),
      total: yup
        .number()
        .required('Total is required')
        .positive('Total must be positive'),
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
