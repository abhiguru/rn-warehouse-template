/**
 * Signed-in devices (backend migration 140): `list_user_sessions(p_user_id)` for administrators (and supervisors, for
 * everyone but administrators) and `revoke_session(p_session_id)`. A backend older than 140 has neither: PostgREST
 * answers PGRST202, which is recorded (`facilityRpcSupport`) so the user page hides the section.
 *
 * `revoke_session` answers `{success:true, revoked_current}` also for a session the caller may not revoke, and then
 * changes nothing: the caller reads the list again to see whether the session is gone (`revokeOutcome`).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { isMissingFunction, noteRpcSupport } from '@/config/facilityRpcSupport';
import type { UserSession } from '@/features/users/sessionDevices';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';
import { rpcRefusal } from '@/utils/rpcRefusal';
import { serverText } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';

const log = createLogger('SessionDevices');

export type ListSessionsResult =
  | { success: true; sessions: UserSession[] }
  | { success: false; unsupported?: boolean; code?: string; message: string };

export type RevokeSessionResult =
  | { success: true; revokedCurrent: boolean }
  | { success: false; unsupported?: boolean; /** NOT_FOUND: the session is gone already. */ code?: string; message: string };

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

function readSession(raw: unknown): UserSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id);
  if (!id) return null;
  return {
    id,
    user_agent: text(r.user_agent),
    created_ip: text(r.created_ip),
    created_at: text(r.created_at),
    last_refreshed_at: text(r.last_refreshed_at),
    expires_at: text(r.expires_at),
    is_current: r.is_current === true,
  };
}

/** The reason of a refusal in the app's words; the server's sentence is never shown. */
function refusalMessage(code: string | undefined, sentence: string | undefined, fallback: string): string {
  switch (code) {
    case 'PERMISSION_DENIED':
    case '42501':
      return t('users.devices.notAllowed');
    case 'NOT_FOUND':
      return t('users.devices.gone');
    default:
      return serverText(sentence, fallback);
  }
}

export async function listUserSessions(userId: string): Promise<ListSessionsResult> {
  const generation = getSessionGeneration();
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('list_user_sessions', { p_user_id: userId });
    if (generation !== getSessionGeneration()) throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
    if (error) {
      if (isMissingFunction(error)) {
        noteRpcSupport('userSessions', false);
        return { success: false, unsupported: true, message: t('users.devices.unsupported') };
      }
      return { success: false, code: error.code, message: refusalMessage(error.code, error.message, t('users.devices.loadFailed')) };
    }
    const refusal = rpcRefusal(data);
    if (refusal) {
      const code = text((data as Record<string, unknown> | null)?.error) ?? refusal.code;
      return { success: false, code: code ?? undefined, message: refusalMessage(code ?? undefined, refusal.text, t('users.devices.loadFailed')) };
    }
    const list = data?.data?.sessions;
    if (!Array.isArray(list)) return { success: false, message: t('users.devices.loadFailed') };
    noteRpcSupport('userSessions', true);
    return { success: true, sessions: list.map(readSession).filter((s): s is UserSession => s !== null) };
  } catch (error) {
    log.error('Listing sessions failed');
    return { success: false, message: error instanceof AppError ? error.message : t('users.devices.loadFailed') };
  }
}

export async function revokeSession(sessionId: string): Promise<RevokeSessionResult> {
  const generation = getSessionGeneration();
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('revoke_session', { p_session_id: sessionId });
    // A person who signed out of this phone meanwhile: the answer says nothing about the session on screen.
    if (generation !== getSessionGeneration()) throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
    if (error) {
      if (isMissingFunction(error)) {
        noteRpcSupport('userSessions', false);
        return { success: false, unsupported: true, message: t('users.devices.unsupported') };
      }
      return { success: false, code: error.code, message: refusalMessage(error.code, error.message, t('users.devices.signOutFailed')) };
    }
    if (data?.success === true) return { success: true, revokedCurrent: data.revoked_current === true };
    // An administrator signing out an id that is not there: `{success:false, error:'NOT_FOUND'}`.
    const code = text(data?.error) ?? text(data?.error_code) ?? undefined;
    return { success: false, code, message: refusalMessage(code, text(data?.message) ?? undefined, t('users.devices.signOutFailed')) };
  } catch (error) {
    log.error('Revoking a session failed');
    return { success: false, message: error instanceof AppError ? error.message : t('users.devices.signOutFailed') };
  }
}
