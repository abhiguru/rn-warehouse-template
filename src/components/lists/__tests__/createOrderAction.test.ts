/**
 * What Create order does on the Orders tab, by role and by how many customers the
 * phone holds for the account (phone review 2026-10-14, PW-01: a customer account
 * with two businesses and no order yet could not start one).
 */
import { createOrderAction, type CreateOrderAction } from '../createOrderAction';

const SEARCH: CreateOrderAction = { kind: 'search' };
const CHOOSE: CreateOrderAction = { kind: 'choose' };
const open = (customerId: string): CreateOrderAction => ({ kind: 'open', customerId });

describe('the staff roles keep the customer search, whatever customers the profile carries', () => {
  it.each([
    ['admin', []],
    ['admin', ['business-a']],
    ['admin', ['business-a', 'business-b']],
    ['supervisor', []],
    ['supervisor', ['business-a']],
    ['supervisor', ['business-a', 'business-b']],
    ['staff', []],
    ['staff', ['business-a']],
    ['staff', ['business-a', 'business-b']],
  ])('%s with %j searches', (role, assignedCustomerIds) => {
    expect(createOrderAction({ role, assignedCustomerIds })).toEqual(SEARCH);
  });

  it('search even when the list was opened for one customer, as before', () => {
    expect(createOrderAction({ role: 'staff', explicitCustomerId: 'business-a', assignedCustomerIds: [] })).toEqual(SEARCH);
  });
});

describe('a customer account is routed by its own businesses', () => {
  it.each<[string, string[], CreateOrderAction]>([
    ['no business on the phone asks the facility in the chooser', [], CHOOSE],
    ['exactly one goes straight to its order', ['business-a'], open('business-a')],
    ['two choose', ['business-a', 'business-b'], CHOOSE],
    ['six choose', ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], CHOOSE],
  ])('%s', (_name, assignedCustomerIds, expected) => {
    expect(createOrderAction({ role: 'customer', assignedCustomerIds })).toEqual(expected);
  });

  it('chooses when the profile carries no list of customers at all', () => {
    expect(createOrderAction({ role: 'customer' })).toEqual(CHOOSE);
  });

  it('counts a business once and ignores an empty id', () => {
    expect(createOrderAction({ role: 'customer', assignedCustomerIds: ['business-a', '', 'business-a'] })).toEqual(open('business-a'));
  });

  it('reads the role as the profile stores it', () => {
    expect(createOrderAction({ role: ' Customer ', assignedCustomerIds: ['business-a', 'business-b'] })).toEqual(CHOOSE);
  });

  it('opens the customer the list was opened for, without choosing', () => {
    expect(createOrderAction({ role: 'customer', explicitCustomerId: 'business-b', assignedCustomerIds: ['business-a', 'business-b'] })).toEqual(open('business-b'));
    expect(createOrderAction({ role: 'customer', explicitCustomerId: 'business-b', assignedCustomerIds: [] })).toEqual(open('business-b'));
  });
});

it('sends a profile with no role, or one that is not known, to the search the server guards', () => {
  expect(createOrderAction({ role: null, assignedCustomerIds: ['business-a'] })).toEqual(SEARCH);
  expect(createOrderAction({ role: undefined })).toEqual(SEARCH);
  expect(createOrderAction({ role: 'auditor', assignedCustomerIds: ['business-a', 'business-b'] })).toEqual(SEARCH);
});
