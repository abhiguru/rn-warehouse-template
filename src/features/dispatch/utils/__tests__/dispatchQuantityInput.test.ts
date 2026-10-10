import { readDispatchQuantityInput } from '../dispatchQuantityInput';

describe('readDispatchQuantityInput', () => {
  it('reads whole numbers, in either digit set', () => {
    expect(readDispatchQuantityInput('12')).toEqual({ quantity: 12, isWholeNumber: true });
    expect(readDispatchQuantityInput(' 7 ')).toEqual({ quantity: 7, isWholeNumber: true });
    expect(readDispatchQuantityInput('૧૨')).toEqual({ quantity: 12, isWholeNumber: true });
  });

  it('reads an emptied field as no quantity, without complaint', () => {
    expect(readDispatchQuantityInput('')).toEqual({ quantity: 0, isWholeNumber: true });
    expect(readDispatchQuantityInput('  ')).toEqual({ quantity: 0, isWholeNumber: true });
  });

  it.each(['12.5', '12.', '-5', '1e3', '12 bags', '1,000', '0x10'])(
    'does not turn "%s" into some other number',
    (text) => {
      expect(readDispatchQuantityInput(text)).toEqual({ quantity: 0, isWholeNumber: false });
    }
  );
});
