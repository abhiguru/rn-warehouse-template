/**
 * The create/read/update/delete table behind the Add, Edit and Delete controls
 * (usePermissions). The server decides again on every write; this table only
 * decides which controls a role is shown, so a wrong cell shows a button that
 * always fails or hides one from the owner.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { canWrite, getRolePermissions, hasFullAccess, hasPermission } from '../permissions';
import { usePermissions, type UsePermissionsResult } from '@/hooks/usePermissions';

let mockRole: string | undefined;
jest.mock('@/store/hooks', () => ({ useAppSelector: (select: () => unknown) => select() }));
jest.mock('@/store/slices/authSlice', () => ({
  selectUserRole: () => ({
    role: mockRole,
    isSupervisor: false,
    isAdmin: mockRole === 'admin',
    isStaffRole: mockRole === 'staff',
    isCustomer: mockRole === 'customer',
  }),
}));

// role, create, read, update, delete, write, full access
const TABLE: Array<[string | undefined, boolean, boolean, boolean, boolean, boolean, boolean]> = [
  ['admin', true, true, true, true, true, true],
  ['supervisor', true, true, true, true, true, true],
  ['staff', true, true, true, false, true, false],
  ['customer', false, true, false, false, false, false],
  ['owner', false, false, false, false, false, false],
  [undefined, false, false, false, false, false, false],
];

describe.each(TABLE)('role %s', (role, canCreate, canRead, canUpdate, canDelete, write, full) => {
  it('has the documented create, read, update and delete permissions', () => {
    expect(getRolePermissions(role)).toEqual({ canCreate, canRead, canUpdate, canDelete });
    expect(hasPermission(role, 'delete')).toBe(canDelete);
    expect(canWrite(role)).toBe(write);
    expect(hasFullAccess(role)).toBe(full);
  });

  it('gives the screens the same answers through usePermissions', () => {
    mockRole = role;
    let result!: UsePermissionsResult;
    const Probe = () => {
      result = usePermissions();
      return null;
    };
    act(() => {
      create(React.createElement(Probe));
    });

    expect([result.canCreate, result.canRead, result.canUpdate, result.canDelete]).toEqual([canCreate, canRead, canUpdate, canDelete]);
    expect(result.canWrite).toBe(write);
    expect(result.hasFullAccess).toBe(full);
    expect(result.checkPermission('update')).toBe(canUpdate);
    expect(result.isSupervisor).toBe(role === 'supervisor');
  });
});
