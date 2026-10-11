import { hasZeroChargeLine, isZeroChargeLine, zeroChargeNeedsReason } from '../invoiceCalculations';

// Owner decision 3 of 2026-10-11 (server migration 48): an invoice line may
// have a storage charge of 0. Staff must say why; administrators and
// supervisors may leave the reason empty.
const A = { disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555', charge: 0 };
const B = { disp_trl_id: 'bbbbbbbb-2222-4333-8444-555555555555', charge: 5.5 };
const C = { disp_trl_id: 'cccccccc-2222-4333-8444-555555555555', charge: 0 };

describe('a line with a zero charge', () => {
  it('is one whose charge is 0 or missing; any charge above 0 is not', () => {
    expect(isZeroChargeLine({ charge: 0 })).toBe(true);
    expect(isZeroChargeLine({ charge: null })).toBe(true);
    expect(isZeroChargeLine({})).toBe(true);
    expect(isZeroChargeLine({ charge: 0.01 })).toBe(false);
    expect(isZeroChargeLine({ charge: 999999 })).toBe(false);
  });

  it('is looked for on every line of the invoice', () => {
    expect(hasZeroChargeLine([B, A])).toBe(true);
    expect(hasZeroChargeLine([B])).toBe(false);
    expect(hasZeroChargeLine([])).toBe(false);
  });

});

describe('zeroChargeNeedsReason', () => {
  it('requires a reason from staff when a line has a zero charge', () => {
    expect(zeroChargeNeedsReason({}, [A, B], 'staff')).toBe(true);
    expect(zeroChargeNeedsReason({ zero_charge_reason: '' }, [A], 'staff')).toBe(true);
    expect(zeroChargeNeedsReason({ zero_charge_reason: '   \n ' }, [A], 'staff')).toBe(true);
  });

  it('is satisfied by any text that is not blank: there is no minimum length', () => {
    expect(zeroChargeNeedsReason({ zero_charge_reason: 'x' }, [A], 'staff')).toBe(false);
    expect(zeroChargeNeedsReason({ zero_charge_reason: 'નમૂનો' }, [A], 'staff')).toBe(false);
  });

  it('asks for nothing when no line has a zero charge', () => {
    expect(zeroChargeNeedsReason({}, [B], 'staff')).toBe(false);
    expect(zeroChargeNeedsReason({}, [], 'staff')).toBe(false);
  });

  it('never blocks administrators, supervisors or customers', () => {
    for (const role of ['admin', 'supervisor', 'customer', null, undefined]) {
      expect(zeroChargeNeedsReason({}, [A], role)).toBe(false);
    }
  });
});

describe('an invoice that is being edited', () => {
  // The form starts with the stored reason; the server wants it back on every save.
  const stored = { zero_charge_reason: 'Sample lot' };

  it('is satisfied by the stored reason, whichever lines are free now', () => {
    expect(zeroChargeNeedsReason(stored, [A, B], 'staff')).toBe(false);
    expect(zeroChargeNeedsReason(stored, [A, { ...B, charge: 0 }], 'staff')).toBe(false);
    expect(zeroChargeNeedsReason(stored, [{ ...A, charge: 4 }, { ...B, charge: 0 }], 'staff')).toBe(false);
  });

  it('asks staff again once the stored reason was erased', () => {
    expect(zeroChargeNeedsReason({ zero_charge_reason: '' }, [A, B], 'staff')).toBe(true);
    expect(zeroChargeNeedsReason({ zero_charge_reason: '' }, [A, B], 'supervisor')).toBe(false);
  });
});
