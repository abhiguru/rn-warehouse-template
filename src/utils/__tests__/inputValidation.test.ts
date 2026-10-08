/**
 * Input Validation Tests
 *
 * Tests for input validation utilities
 */

import {
  ValidationError,
  validateUUID,
  validatePhone,
  validateEmail,
  validatePositiveInt,
  validatePositiveDecimal,
  validatePagination,
  validateUUIDArray,
  sanitizeString,
} from '../inputValidation';

describe('Input Validation', () => {
  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  test  ')).toBe('test');
    });

    it('should remove null bytes', () => {
      expect(sanitizeString('test\0null')).toBe('testnull');
    });

    it('should throw error for non-string input', () => {
      expect(() => sanitizeString(123 as any)).toThrow(ValidationError);
    });
  });

  describe('validateUUID', () => {
    it('should accept valid UUIDs', () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      expect(validateUUID(validUUID)).toBe(validUUID);
    });

    it('should reject invalid UUIDs', () => {
      expect(() => validateUUID('invalid-uuid')).toThrow(ValidationError);
      expect(() => validateUUID('123')).toThrow(ValidationError);
      expect(() => validateUUID('')).toThrow(ValidationError);
    });

    it('should reject non-string input', () => {
      expect(() => validateUUID(123 as any)).toThrow(ValidationError);
    });
  });

  describe('validatePhone', () => {
    it('should accept valid Indian phone numbers', () => {
      expect(validatePhone('9876543210')).toBe('9876543210');
      expect(validatePhone('8123456789')).toBe('8123456789');
      expect(validatePhone('7999999999')).toBe('7999999999');
    });

    it('should remove country code', () => {
      expect(validatePhone('919876543210')).toBe('9876543210');
    });

    it('should reject invalid phone numbers', () => {
      expect(() => validatePhone('1234567890')).toThrow(ValidationError);
      expect(() => validatePhone('12345')).toThrow(ValidationError);
      expect(() => validatePhone('abcdefghij')).toThrow(ValidationError);
    });
  });

  describe('validateEmail', () => {
    it('should accept valid emails', () => {
      expect(validateEmail('test@example.com')).toBe('test@example.com');
      expect(validateEmail('user.name+tag@domain.co.in')).toBe('user.name+tag@domain.co.in');
    });

    it('should convert to lowercase', () => {
      expect(validateEmail('Test@EXAMPLE.COM')).toBe('test@example.com');
    });

    it('should reject invalid emails', () => {
      expect(() => validateEmail('invalid')).toThrow(ValidationError);
      expect(() => validateEmail('test@')).toThrow(ValidationError);
      expect(() => validateEmail('@example.com')).toThrow(ValidationError);
    });
  });

  describe('validatePositiveInt', () => {
    it('should accept valid positive integers', () => {
      expect(validatePositiveInt(5)).toBe(5);
      expect(validatePositiveInt('10')).toBe(10);
      expect(validatePositiveInt(0)).toBe(0);
    });

    it('should enforce min and max constraints', () => {
      expect(validatePositiveInt(5, 'Value', { min: 1, max: 10 })).toBe(5);
      expect(() => validatePositiveInt(0, 'Value', { min: 1 })).toThrow(ValidationError);
      expect(() => validatePositiveInt(11, 'Value', { max: 10 })).toThrow(ValidationError);
    });

    it('should reject negative numbers', () => {
      expect(() => validatePositiveInt(-5)).toThrow(ValidationError);
    });

    it('should reject decimals', () => {
      expect(() => validatePositiveInt(5.5)).toThrow(ValidationError);
    });

    it('should reject non-numeric input', () => {
      expect(() => validatePositiveInt('abc')).toThrow(ValidationError);
    });
  });

  describe('validatePositiveDecimal', () => {
    it('should accept valid positive decimals', () => {
      expect(validatePositiveDecimal(5.5)).toBe(5.5);
      expect(validatePositiveDecimal('10.25')).toBe(10.25);
      expect(validatePositiveDecimal(0)).toBe(0);
    });

    it('should enforce decimal places limit', () => {
      expect(validatePositiveDecimal(5.12, 'Value', { maxDecimals: 2 })).toBe(5.12);
      expect(() => validatePositiveDecimal(5.123, 'Value', { maxDecimals: 2 })).toThrow(ValidationError);
    });

    it('should reject negative numbers', () => {
      expect(() => validatePositiveDecimal(-5.5)).toThrow(ValidationError);
    });
  });

  describe('validatePagination', () => {
    it('should use default values when not provided', () => {
      const result = validatePagination({});
      expect(result).toEqual({ limit: 50, offset: 0 });
    });

    it('should accept valid pagination params', () => {
      const result = validatePagination({ limit: 100, offset: 20 });
      expect(result).toEqual({ limit: 100, offset: 20 });
    });

    it('should enforce max limit', () => {
      expect(() => validatePagination({ limit: 2000 })).toThrow(ValidationError);
    });

    it('should reject negative offset', () => {
      expect(() => validatePagination({ offset: -1 })).toThrow(ValidationError);
    });
  });

  describe('validateUUIDArray', () => {
    it('should accept valid UUID arrays', () => {
      const uuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ];
      expect(validateUUIDArray(uuids)).toEqual(uuids);
    });

    it('should enforce length constraints', () => {
      const uuids = ['550e8400-e29b-41d4-a716-446655440000'];
      expect(() => validateUUIDArray(uuids, 'IDs', { minLength: 2 })).toThrow(ValidationError);
      expect(() => validateUUIDArray(uuids, 'IDs', { maxLength: 0 })).toThrow(ValidationError);
    });

    it('should reject arrays with invalid UUIDs', () => {
      const invalidUUIDs = ['550e8400-e29b-41d4-a716-446655440000', 'invalid'];
      expect(() => validateUUIDArray(invalidUUIDs)).toThrow(ValidationError);
    });

    it('should reject non-array input', () => {
      expect(() => validateUUIDArray('not-an-array' as any)).toThrow(ValidationError);
    });
  });
});
