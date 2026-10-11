import { isOtherCustomersStock, linesFromOtherCustomers } from '../lotOwnership';

const CUSTOMER_A = '33333333-2222-4333-8444-555555555555';
const CUSTOMER_B = '88888888-2222-4333-8444-555555555555';

describe('isOtherCustomersStock', () => {
  it("is true for a GRN of a customer other than the dispatch's", () => {
    expect(isOtherCustomersStock(CUSTOMER_A, CUSTOMER_B)).toBe(true);
  });

  it("is false for the dispatch customer's own GRN", () => {
    expect(isOtherCustomersStock(CUSTOMER_A, CUSTOMER_A)).toBe(false);
  });

  it('decides nothing when either customer is unknown', () => {
    expect(isOtherCustomersStock(CUSTOMER_A, undefined)).toBe(false);
    expect(isOtherCustomersStock(CUSTOMER_A, '')).toBe(false);
    expect(isOtherCustomersStock('', CUSTOMER_B)).toBe(false);
    expect(isOtherCustomersStock(null, CUSTOMER_B)).toBe(false);
  });
});

describe('linesFromOtherCustomers', () => {
  it("returns only the lines known to be another customer's", () => {
    const own = { grns_gr_no: 'A0010', grns_customer_id: CUSTOMER_A };
    const other = { grns_gr_no: 'B0007', grns_customer_id: CUSTOMER_B };
    const unknown = { grns_gr_no: 'A0011' };

    expect(linesFromOtherCustomers(CUSTOMER_A, [own, other, unknown])).toEqual([other]);
    expect(linesFromOtherCustomers(CUSTOMER_A, [own, unknown])).toEqual([]);
  });
});
