/**
 * WH-109: Print is offered to admin, supervisor and staff when the facility has printing on; never to a customer, and
 * never when printing is off. The real usePermissions and useCanPrint run; only the store and the capability are set.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useCanPrint } from '../useCanPrint';

let mockRole: string | undefined;
let mockPrinting = true;
jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { userProfile: mockRole ? { id: 'profile-fictional', role: mockRole } : null } }),
}));
jest.mock('@/hooks/useCapability', () => ({ useCapability: (name: string) => (name === 'printing' ? mockPrinting : false) }));

function canPrint(role: string | undefined, printing: boolean): boolean {
  mockRole = role;
  mockPrinting = printing;
  let result: boolean | undefined;
  const Probe = () => {
    result = useCanPrint();
    return null;
  };
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Probe />);
  });
  act(() => tree.unmount());
  return result as boolean;
}

describe('useCanPrint', () => {
  it.each(['admin', 'supervisor', 'staff'])('is true for %s when printing is on', (role) => {
    expect(canPrint(role, true)).toBe(true);
  });

  it('is false for a customer', () => {
    expect(canPrint('customer', true)).toBe(false);
  });

  it.each(['admin', 'supervisor', 'staff', 'customer'])('is false for %s when printing is off', (role) => {
    expect(canPrint(role, false)).toBe(false);
  });

  it('is false when nobody is signed in', () => {
    expect(canPrint(undefined, true)).toBe(false);
  });
});
