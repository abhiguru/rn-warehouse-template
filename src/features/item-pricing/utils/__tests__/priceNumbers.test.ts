import { priceNumber } from '../priceNumbers';

describe('a number typed into the price form', () => {
  it('is read when it is a plain number', () => {
    expect(priceNumber('5')).toBe(5);
    expect(priceNumber('5.50')).toBe(5.5);
    expect(priceNumber('0')).toBe(0);
    expect(priceNumber(' 18 ')).toBe(18);
    expect(priceNumber('૧૨.૫')).toBe(12.5);
    expect(priceNumber('50.125', 3)).toBe(50.125);
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
