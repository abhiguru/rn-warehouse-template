import { discountNeedsReason } from '../invoiceCalculations';

// Server migration 30: staff must give a reason whenever they change an invoice's
// discount; administrators and supervisors may leave it empty.
describe('discountNeedsReason', () => {
  it('requires a reason when staff set or change a discount', () => {
    expect(discountNeedsReason({ discount: 235 }, 'staff')).toBe(true);
    expect(discountNeedsReason({ discount: 235, saved_discount: 100 }, 'staff')).toBe(true);
    expect(discountNeedsReason({ discount: -50 }, 'staff')).toBe(true);
    expect(discountNeedsReason({ discount: 235, discount_reason: '   ' }, 'staff')).toBe(true);
  });

  it('is satisfied by a reason or an unchanged discount', () => {
    expect(discountNeedsReason({ discount: 235, discount_reason: 'Damaged bags' }, 'staff')).toBe(false);
    expect(discountNeedsReason({ discount: 235, saved_discount: 235 }, 'staff')).toBe(false);
    expect(discountNeedsReason({ discount: 0 }, 'staff')).toBe(false);
  });

  it('never blocks administrators, supervisors or customers', () => {
    for (const role of ['admin', 'supervisor', 'customer', null]) {
      expect(discountNeedsReason({ discount: 235 }, role)).toBe(false);
    }
  });
});
