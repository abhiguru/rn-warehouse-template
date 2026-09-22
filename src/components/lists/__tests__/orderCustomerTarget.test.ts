import { resolveCustomerOrderTarget } from '../orderCustomerTarget';

it('routes a single assigned customer without staff-only search', () => {
  expect(
    resolveCustomerOrderTarget({
      assignedCustomerIds: ['customer-a'],
      orderCustomerIds: ['customer-a'],
    })
  ).toBe('customer-a');
});

it('does not guess when a customer account has multiple assignments', () => {
  expect(
    resolveCustomerOrderTarget({
      assignedCustomerIds: ['customer-a', 'customer-b'],
      orderCustomerIds: ['customer-a', 'customer-b'],
    })
  ).toBeNull();
});
