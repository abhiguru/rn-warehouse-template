import { acceptRentText, priceNumber, RENT_MAX, rentNumber } from '../priceNumbers';

describe('a number typed into the price form', () => {
  it('is read when it is a plain number', () => {
    expect(priceNumber('5')).toBe(5);
    expect(priceNumber('5.50')).toBe(5.5);
    expect(priceNumber('0')).toBe(0);
    expect(priceNumber(' 18 ')).toBe(18);
    expect(priceNumber('૧૨.૫')).toBe(12.5);
    expect(priceNumber('50.125', 3)).toBe(50.125);
  });

  it('reads a number that starts with the point', () => {
    expect(priceNumber('.5')).toBe(0.5);
    expect(priceNumber('.25')).toBe(0.25);
  });

  it.each(['', '--5', '-5', 'Rs 5', '1,250', '5.', '.5.', '1e3', '5.555', 'abc'])('is not read from "%s"', (text) => {
    expect(priceNumber(text)).toBeNull();
  });
});

describe('a whole-number field (0 decimals)', () => {
  it('reads whole numbers and refuses a decimal point', () => {
    expect(priceNumber('12', 0)).toBe(12);
    expect(priceNumber('0', 0)).toBe(0);
    expect(priceNumber('12.5', 0)).toBeNull();
    expect(priceNumber('12.', 0)).toBeNull();
    expect(priceNumber('', 0)).toBeNull();
  });
});

describe('the rent in a price-form field (limit 9999.99, owner 2026-10-20)', () => {
  it('has the limit of the invoice line Charge', () => {
    expect(RENT_MAX).toBe(9999.99);
  });

  it('is read from 0 up to the limit with at most 2 decimals, in either digits', () => {
    expect(rentNumber('0')).toBe(0);
    expect(rentNumber('12.50')).toBe(12.5);
    expect(rentNumber(' 9999.99 ')).toBe(9999.99);
    expect(rentNumber('૧૨.૫')).toBe(12.5);
    expect(rentNumber('.5')).toBe(0.5);
  });

  it.each(['', '10000', '9999.995', '12345.6', '3.125', '-1', '1,250', '5.', 'abc'])('is not read from "%s"', text => {
    expect(rentNumber(text)).toBeNull();
    expect(rentNumber(null)).toBeNull();
    expect(rentNumber(undefined)).toBeNull();
  });
});

describe('what a rent field holds after a key press', () => {
  it('takes digits, one point and up to 2 decimals as typed', () => {
    expect(acceptRentText('1', '12')).toBe('12');
    expect(acceptRentText('12', '12.')).toBe('12.');
    expect(acceptRentText('12.', '12.5')).toBe('12.5');
    expect(acceptRentText('12.5', '12.50')).toBe('12.50');
    expect(acceptRentText('૧', '૧૨')).toBe('૧૨');
  });

  it('takes a cleared field', () => {
    expect(acceptRentText('5', '')).toBe('');
    expect(acceptRentText('5', '  ')).toBe('  ');
  });

  it('takes ".5" and a lone point (the person is on the way to 0.5)', () => {
    expect(acceptRentText('', '.')).toBe('.');
    expect(acceptRentText('.', '.5')).toBe('.5');
    expect(acceptRentText('', '.5')).toBe('.5');
    expect(acceptRentText('.5', '.55')).toBe('.55');
  });

  it('keeps the old text when the key would add a third decimal, a second point or a letter', () => {
    expect(acceptRentText('12.50', '12.505')).toBe('12.50');
    expect(acceptRentText('12.5', '12.5.')).toBe('12.5');
    expect(acceptRentText('12', '12a')).toBe('12');
    expect(acceptRentText('12', '-12')).toBe('12');
    expect(acceptRentText('.55', '.555')).toBe('.55');
  });

  it('keeps the old text when the key would pass 9999.99', () => {
    expect(acceptRentText('999', '9999')).toBe('9999');
    expect(acceptRentText('9999', '99999')).toBe('9999');
    expect(acceptRentText('9999.9', '9999.99')).toBe('9999.99');
    expect(acceptRentText('9999.99', '9999.999')).toBe('9999.99');
    expect(acceptRentText('1000', '10000')).toBe('1000');
    expect(acceptRentText('૯૯૯૯', '૯૯૯૯૯')).toBe('૯૯૯૯');
  });

  it('lets a stored rent above the limit be shortened, but not made longer or bigger', () => {
    // 12345.67 is a rent stored before the limit.
    expect(acceptRentText('12345.67', '12345.6')).toBe('12345.6');
    expect(acceptRentText('12345.67', '12345.')).toBe('12345.');
    expect(acceptRentText('12345.67', '1234')).toBe('1234');
    expect(acceptRentText('12345.67', '12345.7')).toBe('12345.67');
    expect(acceptRentText('12345.67', '123456.67')).toBe('12345.67');
    expect(acceptRentText('12345.67', '99999')).toBe('12345.67');
  });
});
