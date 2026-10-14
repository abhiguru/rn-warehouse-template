import { validateBasicInfo, validateDetails } from '../customerValidation';

describe('first error per field (G-48)', () => {
  it('asks for the name and the mobile number when both are empty', async () => {
    const { isValid, errors } = await validateBasicInfo({ name: '', mobile: '', email: '' });
    expect(isValid).toBe(false);
    expect(errors.name).toBe('Enter the customer name.');
    expect(errors.mobile).toBe('Enter a mobile number.');
  });

  it('still names the length problem when something is typed', async () => {
    const { errors } = await validateBasicInfo({ name: 'A', mobile: '12', email: '' });
    expect(errors.name).toBe('Enter at least 2 characters.');
    expect(errors.mobile).toBe('Enter a 10-digit mobile number.');
  });
});

describe('CR-23: limits are the database column sizes', () => {
  const details = (extra: Record<string, string>) => ({
    city: '', state: '', pincode: '', address: '', gst: '', pan: '', contact_name: '', contact_mobile: '', contact_email: '', ...extra,
  });
  it('refuses an 81-character name and accepts 80', async () => {
    expect((await validateBasicInfo({ name: 'a'.repeat(81), mobile: '9000000099', email: '' })).errors.name).toBe('Use 80 characters or fewer.');
    expect((await validateBasicInfo({ name: 'a'.repeat(80), mobile: '9000000099', email: '' })).isValid).toBe(true);
  });
  it('refuses a 26-character city and a 301-character address', async () => {
    expect((await validateDetails(details({ city: 'c'.repeat(26) }))).errors.city).toBe('Use 25 characters or fewer.');
    expect((await validateDetails(details({ city: 'c'.repeat(25) }))).isValid).toBe(true);
    expect((await validateDetails(details({ address: 'x'.repeat(301) }))).errors.address).toBe('Use 300 characters or fewer.');
    expect((await validateDetails(details({ address: 'x'.repeat(300) }))).isValid).toBe(true);
  });
});
