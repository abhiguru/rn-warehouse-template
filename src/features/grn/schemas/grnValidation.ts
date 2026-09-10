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

  qty: yup
    .number()
    .required('Quantity is required')
    .positive('Quantity must be positive')
    .integer('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1'),

  stock: yup
    .number()
    .required('Stock is required')
    .integer('Stock must be a whole number')
    .min(0, 'Stock cannot be negative'),

  weight: yup
    .number()
    .integer('Weight must be a whole number')
    .min(0, 'Weight cannot be negative'),

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