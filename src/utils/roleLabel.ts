/**
 * The name of a stored role (`admin`, `supervisor`, `staff`, `customer`) in the
 * app's language. A stored value is never shown or capitalised itself
 * (docs/I18N.md rule 9); a missing or unknown role reads "User".
 */
import { t, type TranslationKey } from '@/i18n';

const ROLE_KEYS: Record<string, TranslationKey> = {
  admin: 'users.role.admin',
  supervisor: 'users.role.supervisor',
  staff: 'users.role.staff',
  customer: 'users.role.customer',
};

export const roleLabel = (role: string | null | undefined): string =>
  t((role && ROLE_KEYS[role]) || 'users.role.user');
