/**
 * isAccessRefusal reads a refusal by its code first, so a refusal whose
 * sentence is shown in Gujarati is still told apart from a server failure.
 */
import { ACCESS_REFUSED_CODE, isAccessRefusal } from '../rpcRefusal';

const GUJARATI_NO_PERMISSION = 'તમને આ કામ કરવાની પરવાનગી નથી.';

describe('isAccessRefusal', () => {
  it('recognises the server code, the app code and the dashboard code whatever the words', () => {
    expect(isAccessRefusal({ code: '42501', text: GUJARATI_NO_PERMISSION })).toBe(true);
    expect(isAccessRefusal({ code: ACCESS_REFUSED_CODE, text: GUJARATI_NO_PERMISSION })).toBe(true);
    expect(isAccessRefusal({ code: 'STAFF_ONLY', text: 'પરવાનગી નથી. આ અહેવાલ ફક્ત સ્ટાફ માટે છે.' })).toBe(true);
  });

  it("still reads the server's English words when no code came", () => {
    expect(isAccessRefusal({ text: 'Access denied: customer not accessible' })).toBe(true);
  });

  it('does not take a failure code or a plain failure for a refusal', () => {
    expect(isAccessRefusal({ code: 'REPORT_REFUSED', text: 'Could not load the report' })).toBe(false);
    expect(isAccessRefusal({ code: '22012', text: 'division by zero' })).toBe(false);
    // Words alone in Gujarati say nothing: that is why the envelope always carries the code.
    expect(isAccessRefusal({ text: GUJARATI_NO_PERMISSION })).toBe(false);
  });
});
