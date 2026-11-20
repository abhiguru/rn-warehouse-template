import { renderHook } from '@testing-library/react-native';
import { useRoleBasedAccess, type RoleBasedAccess } from '../useRoleBasedAccess';

let mockProfile: { role: string; assignedCustomerIds?: string[]; assignedCustomers?: { id: string; name: string }[] } | null = null;
jest.mock('@/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { userProfile: mockProfile } }),
}));

async function access(): Promise<RoleBasedAccess> {
  const { result } = await renderHook(() => useRoleBasedAccess());
  return result.current;
}

it.each([
  // role, isWarehouseUser, isManager, isCustomerAccount, canManageOrders
  ['admin', true, true, false, true],
  ['supervisor', true, true, false, true],
  ['staff', true, false, false, true],
  ['customer', false, false, true, false],
])('%s: warehouse user %s, manager %s, customer account %s, orders %s', async (role, warehouse, manager, customer, orders) => {
  mockProfile = { role, assignedCustomerIds: [] };
  const result = await access();
  expect(result.isWarehouseUser).toBe(warehouse);
  expect(result.isManager).toBe(manager);
  expect(result.isCustomerAccount).toBe(customer);
  expect(result.canManageOrders).toBe(orders);
  // The ambiguous flag is gone: it meant "admin or supervisor" here and "role is staff" elsewhere.
  expect('isStaff' in result).toBe(false);
});

it.each([
  // role, assigned customers, scope, all-customers list, the one customer
  ['admin', [], 'all-customers', true, null],
  ['supervisor', [], 'all-customers', true, null],
  ['staff', [], 'all-customers', true, null],
  ['customer', ['c1'], 'one-customer', false, 'c1'],
  ['customer', ['c1', 'c2'], 'choose-customer', false, null],
  ['customer', [], 'none', false, null],
])('%s with customers %j: report scope %s', async (role, customers, scope, list, single) => {
  mockProfile = { role, assignedCustomerIds: customers };
  const result = await access();
  expect(result.reportScope).toBe(scope);
  expect(result.shouldShowListView).toBe(list);
  expect(result.singleAssignedCustomerId).toBe(single);
});

it('gives the report picker the names of the assigned customers', async () => {
  mockProfile = {
    role: 'customer',
    assignedCustomers: [
      { id: 'c1', name: 'Fictional Traders' },
      { id: 'c2', name: 'Example Agro' },
    ],
  };
  const result = await access();
  expect(result.assignedCustomerIds).toEqual(['c1', 'c2']);
  expect(result.assignedCustomers).toEqual([
    { id: 'c1', name: 'Fictional Traders' },
    { id: 'c2', name: 'Example Agro' },
  ]);
  expect(result.reportScope).toBe('choose-customer');
});

it('denies order management without a profile', async () => {
  mockProfile = null;
  expect((await access()).canManageOrders).toBe(false);
});
