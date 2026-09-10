/**
 * Customer Form Validation Schemas
 *
 * Yup validation schemas for the multi-step customer form.
 * Includes step-by-step validation and helper functions.
 */

import * as yup from 'yup';
import { CustomerFormData, CustomerValidationErrors } from '@/types/customer.types';

// =============================================================================
// REGEX PATTERNS
// =============================================================================

/**
 * Indian mobile number (10 digits, optionally prefixed with 91)
 */
const MOBILE_REGEX = /^(91)?[6-9]\d{9}$/;

/**
 * Email pattern (RFC 5322 simplified)
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GST Number pattern (15 alphanumeric characters)
 * Format: 2 digits state code + 10 char PAN + 1 char entity + 1 char Z + 1 check digit
 */
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * PAN Number pattern (10 characters)
 * Format: 5 letters + 4 digits + 1 letter
 */
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/**
 * Indian Pincode (6 digits)
 */
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

// =============================================================================
// STEP 1: BASIC INFO SCHEMA
// =============================================================================

export const basicInfoSchema = yup.object().shape({
  name: yup
    .string()
    .required('Customer name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(200, 'Name must be at most 200 characters')
    .trim(),

  mobile: yup
    .string()
    .required('Mobile number is required')
    .test('valid-mobile', 'Please enter a valid 10-digit mobile number', (value) => {
      if (!value) return false;
      // Remove country code if present
      const cleaned = value.replace(/^91/, '').replace(/\D/g, '');
      return cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned);
    }),

  email: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .test('valid-email', 'Please enter a valid email address', (value) => {
      if (!value || value === '') return true; // Optional field
      return EMAIL_REGEX.test(value);
    })
    .max(100, 'Email must be at most 100 characters'),
});

// =============================================================================
// STEP 2: DETAILS SCHEMA
// =============================================================================

export const detailsSchema = yup.object().shape({
  // Address fields (all optional)
  city: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .max(50, 'City must be at most 50 characters'),

  state: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .max(50, 'State must be at most 50 characters'),

  pincode: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .test('valid-pincode', 'Please enter a valid 6-digit pincode', (value) => {
      if (!value || value === '') return true;
      return PINCODE_REGEX.test(value);
    }),

  address: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .max(500, 'Address must be at most 500 characters'),

  // Tax fields (optional with format validation)
  gst: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value?.toUpperCase()))
    .test('valid-gst', 'Please enter a valid 15-character GST number', (value) => {
      if (!value || value === '') return true;
      return GST_REGEX.test(value);
    }),

  pan: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value?.toUpperCase()))
    .test('valid-pan', 'Please enter a valid 10-character PAN number', (value) => {
      if (!value || value === '') return true;
      return PAN_REGEX.test(value);
    }),

  // Contact person fields (optional)
  contact_name: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .max(100, 'Contact name must be at most 100 characters'),

  contact_mobile: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .test('valid-contact-mobile', 'Please enter a valid mobile number', (value) => {
      if (!value || value === '') return true;
      const cleaned = value.replace(/^91/, '').replace(/\D/g, '');
      return cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned);
    }),

  contact_email: yup
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .test('valid-contact-email', 'Please enter a valid email address', (value) => {
      if (!value || value === '') return true;
      return EMAIL_REGEX.test(value);
    })
    .max(100, 'Contact email must be at most 100 characters'),
});

// =============================================================================
// STEP 3: DOCUMENTS SCHEMA (mostly optional)
// =============================================================================

export const documentsSchema = yup.object().shape({
  document_urls: yup
    .array()
    .of(
      yup.string().test('valid-url', 'Invalid document URL', (value) => {
        if (!value) return true;
        // Allow http/https URLs and local file URIs
        return /^(https?:\/\/|file:\/\/\/)/.test(value);
      })
    )
    .max(10, 'Maximum 10 documents allowed'),

  document_images: yup
    .array()
    .max(10, 'Maximum 10 documents allowed'),

  image_urls: yup
    .array()
    .of(
      yup.string().test('valid-url', 'Invalid image URL', (value) => {
        if (!value) return true;
        // Allow http/https URLs and local file URIs
        return /^(https?:\/\/|file:\/\/\/)/.test(value);
      })
    )
    .max(10, 'Maximum 10 images allowed'),

  customer_images: yup
    .array()
    .max(10, 'Maximum 10 images allowed'),
});

// =============================================================================
// FULL CUSTOMER SCHEMA
// =============================================================================

export const fullCustomerSchema = yup.object().shape({
  // Step 1 fields
  ...basicInfoSchema.fields,
  // Step 2 fields
  ...detailsSchema.fields,
  // Step 3 fields
  ...documentsSchema.fields,
});

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate step 1 (basic info)
 */
export async function validateStep1(
  data: Pick<CustomerFormData, 'name' | 'mobile' | 'email'>
): Promise<{ isValid: boolean; errors: CustomerValidationErrors }> {
  try {
    await basicInfoSchema.validate(data, { abortEarly: false });
    return { isValid: true, errors: {} };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      const errors: CustomerValidationErrors = {};
      error.inner.forEach((err) => {
        if (err.path) {
          errors[err.path as keyof CustomerValidationErrors] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    throw error;
  }
}

/**
 * Validate step 2 (details)
 */
export async function validateStep2(
  data: Pick<
    CustomerFormData,
    | 'city'
    | 'state'
    | 'pincode'
    | 'address'
    | 'gst'
    | 'pan'
    | 'contact_name'
    | 'contact_mobile'
    | 'contact_email'
  >
): Promise<{ isValid: boolean; errors: CustomerValidationErrors }> {
  try {
    await detailsSchema.validate(data, { abortEarly: false });
    return { isValid: true, errors: {} };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      const errors: CustomerValidationErrors = {};
      error.inner.forEach((err) => {
        if (err.path) {
          errors[err.path as keyof CustomerValidationErrors] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    throw error;
  }
}

/**
 * Validate step 3 (documents)
 */
export async function validateStep3(
  data: Pick<CustomerFormData, 'document_urls' | 'document_images'>
): Promise<{ isValid: boolean; errors: CustomerValidationErrors }> {
  try {
    await documentsSchema.validate(data, { abortEarly: false });
    return { isValid: true, errors: {} };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      const errors: CustomerValidationErrors = {};
      error.inner.forEach((err) => {
        if (err.path) {
          errors[err.path as keyof CustomerValidationErrors] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    throw error;
  }
}

/**
 * Validate entire form
 */
export async function validateFullForm(
  data: CustomerFormData
): Promise<{ isValid: boolean; errors: CustomerValidationErrors }> {
  try {
    await fullCustomerSchema.validate(data, { abortEarly: false });
    return { isValid: true, errors: {} };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      const errors: CustomerValidationErrors = {};
      error.inner.forEach((err) => {
        if (err.path) {
          errors[err.path as keyof CustomerValidationErrors] = err.message;
        }
      });
      return { isValid: false, errors };
    }
    throw error;
  }
}

/**
 * Validate a specific step by step number
 */
export async function validateStep(
  step: number,
  data: CustomerFormData
): Promise<{ isValid: boolean; errors: CustomerValidationErrors }> {
  switch (step) {
    case 1:
      return validateStep1({
        name: data.name,
        mobile: data.mobile,
        email: data.email,
      });
    case 2:
      return validateStep2({
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        address: data.address,
        gst: data.gst,
        pan: data.pan,
        contact_name: data.contact_name,
        contact_mobile: data.contact_mobile,
        contact_email: data.contact_email,
      });
    case 3:
      return validateStep3({
        document_urls: data.document_urls,
        document_images: data.document_images,
      });
    default:
      return { isValid: true, errors: {} };
  }
}

/**
 * Validate a single field
 */
export async function validateField(
  field: keyof CustomerFormData,
  value: any
): Promise<string | null> {
  try {
    const schema = fullCustomerSchema.fields[field];
    if (schema) {
      await (schema as yup.Schema).validate(value);
    }
    return null;
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      return error.message;
    }
    return null;
  }
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

/**
 * Format mobile number with country code
 */
export function formatMobile(mobile: string): string {
  if (!mobile) return '';
  // Remove all non-digits
  const digits = mobile.replace(/\D/g, '');
  // Remove leading 91 if present
  const cleaned = digits.replace(/^91/, '');
  // Return with 91 prefix
  return cleaned.length === 10 ? `91${cleaned}` : mobile;
}

/**
 * Format GST to uppercase
 */
export function formatGST(gst: string): string {
  return gst ? gst.toUpperCase().replace(/\s/g, '') : '';
}

/**
 * Format PAN to uppercase
 */
export function formatPAN(pan: string): string {
  return pan ? pan.toUpperCase().replace(/\s/g, '') : '';
}

/**
 * Format pincode (remove non-digits)
 */
export function formatPincode(pincode: string): string {
  return pincode ? pincode.replace(/\D/g, '').slice(0, 6) : '';
}
