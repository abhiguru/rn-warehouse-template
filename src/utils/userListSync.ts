/**
 * Tells the Users list what Edit user changed, so Back from a user updates that one row in
 * place instead of loading the first 100 rows again. The list is open underneath Edit user,
 * so a plain listener is enough; with no listener (the list is not mounted) a change is dropped
 * and the list loads fresh when it opens.
 */
import type { UserListItem } from '@/types/user.types';

export type UserListChange =
  /** Fields of one row changed. */
  | { kind: 'patch'; id: string; patch: Partial<Pick<UserListItem, 'role' | 'active' | 'assigned_customers_count' | 'enrollment_status' | 'is_deleted' | 'name'>> }
  /** The list is out of date (a user is gone): load it again. */
  | { kind: 'refresh' };

type Listener = (change: UserListChange) => void;

const listeners = new Set<Listener>();

export function publishUserListChange(change: UserListChange): void {
  listeners.forEach((listener) => listener(change));
}

export function subscribeUserListChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
