import { validateStep1 } from '../dispatchValidation';

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
