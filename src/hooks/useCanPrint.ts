/**
 * Whether Print is offered to this person on this facility: the role is admin, supervisor or staff (owner decision,
 * 2026-11-07; the backend allows the same three) and the facility has printing set up. One rule for every list and
 * detail screen. PrintRangeDialog keeps its own capability check as a backstop.
 */
import { usePermissions } from '@/hooks/usePermissions';
import { useCapability } from '@/hooks/useCapability';

const PRINT_ROLES: readonly string[] = ['admin', 'supervisor', 'staff'];

export function useCanPrint(): boolean {
  const { role } = usePermissions();
  const printingAvailable = useCapability('printing');
  return printingAvailable && typeof role === 'string' && PRINT_ROLES.includes(role);
}
