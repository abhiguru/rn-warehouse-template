/**
 * WH-109: Print is offered to admin, supervisor and staff when the facility has printing on; never to a customer, and
 * never when printing is off. The real usePermissions and useCanPrint run; only the store and the capability are set.
 */
import { renderHook } from '@testing-library/react-native';
import { useCanPrint } from '../useCanPrint';

let mockRole: string | undefined;
let mockPrinting = true;
jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { userProfile: mockRole ? { id: 'profile-fictional', role: mockRole } : null } }),
}));
jest.mock('@/hooks/useCapability', () => ({ useCapability: (name: string) => (name === 'printing' ? mockPrinting : false) }));

async function canPrint(role: string | undefined, printing: boolean): Promise<boolean> {
  mockRole = role;
  mockPrinting = printing;
  const { result } = await renderHook(() => useCanPrint());
  return result.current;
}

describe('useCanPrint', () => {
  it.each(['admin', 'supervisor', 'staff'])('is true for %s when printing is on', async (role) => {
    expect(await canPrint(role, true)).toBe(true);
  });

  it('is false for a customer', async () => {
    expect(await canPrint('customer', true)).toBe(false);
  });

  it.each(['admin', 'supervisor', 'staff', 'customer'])('is false for %s when printing is off', async (role) => {
    expect(await canPrint(role, false)).toBe(false);
  });

  it('is false when nobody is signed in', async () => {
    expect(await canPrint(undefined, true)).toBe(false);
  });
});
