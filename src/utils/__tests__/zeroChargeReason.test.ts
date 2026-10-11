import {
  hasZeroChargeLine,
  isZeroChargeLine,
  zeroChargeLineSet,
  zeroChargeNeedsReason,
  zeroChargeReason,
} from '../invoiceCalculations';

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

  it('gives a set that does not depend on the order of the lines', () => {
    expect(zeroChargeLineSet([A, B, C])).toBe(zeroChargeLineSet([C, B, A]));
    expect(zeroChargeLineSet([A, B, C])).not.toBe(zeroChargeLineSet([A, B]));
    expect(zeroChargeLineSet([B])).toBe('');
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

describe('the reason of an invoice that is being edited', () => {
  const stored = {
    zero_charge_reason: 'Sample lot',
    saved_zero_charge_reason: 'Sample lot',
    saved_zero_charge_lines: zeroChargeLineSet([A, B]),
    zero_charge_reason_edited: false,
  };

  it('is the stored one while the same lines have a zero charge', () => {
    expect(zeroChargeReason(stored, [A, B])).toBe('Sample lot');
    expect(zeroChargeReason(stored, [B, A])).toBe('Sample lot');
    expect(zeroChargeNeedsReason(stored, [A, B], 'staff')).toBe(false);
  });

  it('is empty once another line gets a zero charge, so a new one has to be written', () => {
    const lines = [A, { ...B, charge: 0 }];
    expect(zeroChargeReason(stored, lines)).toBe('');
    expect(zeroChargeNeedsReason(stored, lines, 'staff')).toBe(true);
    expect(zeroChargeNeedsReason(stored, lines, 'admin')).toBe(false);
  });

  it('comes back when the lines are as they were stored', () => {
    expect(zeroChargeReason(stored, [{ ...A, charge: 4 }, B])).toBe('');
    expect(zeroChargeReason(stored, [{ ...A, charge: 0 }, B])).toBe('Sample lot');
  });

  it('is what was written in this edit, whatever the lines do afterwards', () => {
    const typed = { ...stored, zero_charge_reason: 'Agreed with the owner', zero_charge_reason_edited: true };
    expect(zeroChargeReason(typed, [A, B])).toBe('Agreed with the owner');
    expect(zeroChargeReason(typed, [A, { ...B, charge: 0 }])).toBe('Agreed with the owner');
    expect(zeroChargeReason(typed, [{ ...A, charge: 4 }, B])).toBe('Agreed with the owner');
  });

  it('stays erased when the person erased it', () => {
    const erased = { ...stored, zero_charge_reason: '', zero_charge_reason_edited: true };
    expect(zeroChargeReason(erased, [A, B])).toBe('');
    expect(zeroChargeNeedsReason(erased, [A, B], 'staff')).toBe(true);
  });
});

describe('the reason of a new invoice', () => {
  it('is what was written, and nothing before that', () => {
    expect(zeroChargeReason({}, [A])).toBe('');
    expect(zeroChargeReason({ zero_charge_reason: 'Sample lot', zero_charge_reason_edited: true }, [A])).toBe('Sample lot');
  });
});
