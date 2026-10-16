import { rateRights } from '../rateRights';

describe('rateRights', () => {
  it.each(['supervisor', 'admin'])('gives %s everything', role => {
    expect(rateRights(role)).toEqual({ canWrite: true, canCorrect: true, canStartInPast: true, canSeeChanges: true, canSeeOldRates: true });
  });
  it.each(['staff', 'customer', null, undefined, 'unknown'])('gives %s nothing', role => {
    expect(rateRights(role as string | null | undefined)).toEqual({ canWrite: false, canCorrect: false, canStartInPast: false, canSeeChanges: false, canSeeOldRates: false });
  });
});
