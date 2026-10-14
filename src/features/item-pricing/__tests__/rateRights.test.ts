import { rateRights } from '../rateRights';

describe('rateRights', () => {
  it('gives staff writing and old rates, but no correcting, past starts or changes', () => {
    expect(rateRights('staff')).toEqual({ canWrite: true, canCorrect: false, canStartInPast: false, canSeeChanges: false, canSeeOldRates: true });
  });
  it.each(['supervisor', 'admin'])('gives %s everything', role => {
    expect(rateRights(role)).toEqual({ canWrite: true, canCorrect: true, canStartInPast: true, canSeeChanges: true, canSeeOldRates: true });
  });
  it.each(['customer', null, undefined, 'unknown'])('gives %s nothing', role => {
    expect(rateRights(role as string | null | undefined)).toEqual({ canWrite: false, canCorrect: false, canStartInPast: false, canSeeChanges: false, canSeeOldRates: false });
  });
});
