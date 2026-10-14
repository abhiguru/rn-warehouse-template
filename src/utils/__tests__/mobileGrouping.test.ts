import { groupMobileDigits } from '../mobileGrouping';

describe('groupMobileDigits', () => {
  it('groups ten digits 5 + 5', () => {
    expect(groupMobileDigits('9999900302')).toBe('99999 00302');
  });
  it('leaves five digits or fewer alone', () => {
    expect(groupMobileDigits('99999')).toBe('99999');
    expect(groupMobileDigits('')).toBe('');
  });
  it('starts the second group at the sixth digit', () => {
    expect(groupMobileDigits('999990')).toBe('99999 0');
  });
  it('drops spaces and signs before grouping', () => {
    expect(groupMobileDigits('99999 00302')).toBe('99999 00302');
  });
  it('returns longer input unchanged', () => {
    expect(groupMobileDigits('+91 99999 00302')).toBe('+91 99999 00302');
  });
});
