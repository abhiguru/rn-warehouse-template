import { isRateRefusalCode, rateRefusalText } from '../rateErrors';

describe('rateRefusalText', () => {
  it('BANDS_OVERLAP with the start day of the conflicting row reads like RATE_PLANNED (D5)', () => {
    expect(rateRefusalText('BANDS_OVERLAP', { starts_on: '2026-11-01' }, 'x')).toBe(rateRefusalText('RATE_PLANNED', { starts_on: '2026-11-01' }, 'x'));
    expect(rateRefusalText('BANDS_OVERLAP', { starts_on: '2026-11-01' }, 'x')).toBe('A rate for this weight band already starts on 01/11/26. Choose a last day before it.');
  });

  it('BANDS_OVERLAP without a day keeps the general text', () => {
    expect(rateRefusalText('BANDS_OVERLAP', {}, 'x')).toContain('overlaps another band');
  });

  it('STALE_RATES is a rate refusal, worded as a change by someone else (backend migration 120)', () => {
    expect(isRateRefusalCode('STALE_RATES')).toBe(true);
    expect(rateRefusalText('STALE_RATES', { ids: ['x'] }, 'server text')).toBe(
      'A rate of one of these items was changed by someone else. The rates are shown again; check them and save again.'
    );
  });
});
