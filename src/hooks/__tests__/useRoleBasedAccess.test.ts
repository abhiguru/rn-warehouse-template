import React from 'react';
import { act, create } from 'react-test-renderer';
import { useRoleBasedAccess, type RoleBasedAccess } from '../useRoleBasedAccess';

let mockProfile: { role: string; assignedCustomerIds?: string[] } | null = null;
jest.mock('@/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { userProfile: mockProfile } }),
}));

function access(): RoleBasedAccess {
  let captured!: RoleBasedAccess;
  const Probe = () => { captured = useRoleBasedAccess(); return null; };
  act(() => { create(React.createElement(Probe)); });
  return captured;
}

it.each([
  ['admin', true, true],
  ['supervisor', true, true],
  ['staff', false, true],
  ['customer', false, false],
])('%s: isStaff=%s, canManageOrders=%s', (role, isStaff, canManageOrders) => {
  mockProfile = { role, assignedCustomerIds: [] };
  const result = access();
  expect(result.isStaff).toBe(isStaff);
  expect(result.canManageOrders).toBe(canManageOrders);
});

it('denies order management without a profile', () => {
  mockProfile = null;
  expect(access().canManageOrders).toBe(false);
});
