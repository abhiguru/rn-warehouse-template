import { rateRefusalText } from '../rateErrors';

describe('rateRefusalText', () => {
  it('BANDS_OVERLAP with the start day of the conflicting row reads like RATE_PLANNED (D5)', () => {
    expect(rateRefusalText('BANDS_OVERLAP', { starts_on: '2026-11-01' }, 'x')).toBe(rateRefusalText('RATE_PLANNED', { starts_on: '2026-11-01' }, 'x'));
    expect(rateRefusalText('BANDS_OVERLAP', { starts_on: '2026-11-01' }, 'x')).toBe('A rate for this weight band already starts on 1 Nov 2026. Choose a last day before it.');
  });

  it('BANDS_OVERLAP without a day keeps the general text', () => {
    expect(rateRefusalText('BANDS_OVERLAP', {}, 'x')).toContain('overlaps another band');
  });
});
