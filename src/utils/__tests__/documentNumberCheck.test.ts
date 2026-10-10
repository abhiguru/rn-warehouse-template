import { documentNumberState } from '../documentNumberCheck';

const OWN = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';

describe('documentNumberState', () => {
  it('a number nobody holds is free, when creating and when editing', () => {
    expect(documentNumberState({ exists: false })).toBe('free');
    expect(documentNumberState({ exists: false }, OWN)).toBe('free');
  });

  it('any existing document is a clash when creating', () => {
    expect(documentNumberState({ exists: true, id: OTHER })).toBe('taken');
    expect(documentNumberState({ exists: true, id: OTHER }, null)).toBe('taken');
  });

  it("the edited document's own number is not a clash", () => {
    expect(documentNumberState({ exists: true, id: OWN }, OWN)).toBe('own');
  });

  it("another document's number is a clash when editing", () => {
    expect(documentNumberState({ exists: true, id: OTHER }, OWN)).toBe('taken');
  });

  it('a failed check decides nothing', () => {
    expect(documentNumberState({ exists: false, error: true }, OWN)).toBe('unknown');
    expect(documentNumberState({ exists: false, error: true })).toBe('unknown');
  });
});
