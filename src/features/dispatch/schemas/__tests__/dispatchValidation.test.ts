import { validateStep1 } from '../dispatchValidation';
import { validationSummary } from '@/utils/validationSummary';
import { t } from '@/i18n';

const validHeader = {
  disp_date: '2026-01-01',
  registration: 'TEST 1234',
  customer_id: '22222222-0000-4000-8000-000000000001',
  customer_name: 'Disposable Customer',
  supervisor_id: '11111111-0000-4000-8000-000000000001',
  supervisor_name: 'Demo Admin',
  note: '',
};

describe('dispatch Step 1 generated-number contract', () => {
  it.each(['I0001', 'I0011', 'I10000', 'I9999999'])(
    'accepts the backend-generated value %s',
    async (disp_no) => {
      await expect(validateStep1({ ...validHeader, disp_no })).resolves.toEqual({
        isValid: true,
        errors: {},
      });
    },
  );

  it('rejects a value beyond the database-supported numeric range', async () => {
    const result = await validateStep1({ ...validHeader, disp_no: 'I10000000' });

    expect(result.isValid).toBe(false);
    expect(result.errors.disp_no).toBe('Dispatch number must be at most 8 characters');
  });
});

describe('dispatch Step 1 messages for empty fields', () => {
  it('says the vehicle number is required, not that its format is wrong', async () => {
    const result = await validateStep1({ ...validHeader, disp_no: 'I0001', registration: '' });

    expect(result.isValid).toBe(false);
    expect(result.errors.registration).toBe(t('dispatch.validation.registrationRequired'));
    expect(result.errors.registration).not.toBe(t('dispatch.validation.registrationFormat'));
  });

  it('still reports a wrong format when a value is typed', async () => {
    const result = await validateStep1({ ...validHeader, disp_no: 'I0001', registration: 'gj-01' });

    expect(result.errors.registration).toBe(t('dispatch.validation.registrationFormat'));
  });

  it('lists a missing customer once in the summary, although two fields fail', async () => {
    const result = await validateStep1({ ...validHeader, disp_no: 'I0001', customer_id: '', customer_name: '' });

    expect(result.errors.customer_id).toBe(t('dispatch.validation.customerRequired'));
    expect(result.errors.customer_name).toBe(t('dispatch.validation.customerRequired'));
    expect(validationSummary(result.errors)).toBe(t('dispatch.validation.customerRequired'));
  });
});
