/**
 * Signed-in devices of a person (backend migration 140): which administrator or supervisor may see a person's sessions,
 * how a session is described, and what a revoke that changed nothing means. Pure functions; the calls are in
 * src/services/session-devices-service.ts and the section is src/features/users/components/SignedInDevicesSection.tsx.
 */
import type { RoleName } from '@/config/roles';

/** One session of `list_user_sessions`. `created_ip` is already masked by the server (a /24 or /48), or null. */
export interface UserSession {
  id: string;
  user_agent: string | null;
  created_ip: string | null;
  created_at: string | null;
  last_refreshed_at: string | null;
  expires_at: string | null;
  is_current: boolean;
}

/**
 * Whether the caller is offered the person's signed-in devices: administrators for everyone, supervisors for everyone but
 * administrators (the server refuses the rest: PERMISSION_DENIED / 42501). Staff and customers never reach the user page.
 */
export function mayListSessions(callerRole: RoleName | string | null | undefined, targetRole: RoleName | string | null | undefined): boolean {
  if (callerRole === 'admin') return true;
  return callerRole === 'supervisor' && targetRole !== 'admin';
}

/** What a user agent says of the device, in short: the app and its version, the system, or the browser. */
export interface DeviceSummary {
  /** Empty when the agent says nothing the app can use. */
  app: string;
  system: string;
}

const SYSTEMS: [RegExp, (match: RegExpExecArray) => string][] = [
  [/Android[ /]?([\d.]+)?/i, m => (m[1] ? `Android ${m[1]}` : 'Android')],
  [/\b(?:iPhone|iPad|iPod)\b.*?OS ([\d_]+)/i, m => `iOS ${m[1].replace(/_/g, '.')}`],
  [/\biOS[ /]?([\d.]+)/i, m => `iOS ${m[1]}`],
  [/Windows NT ([\d.]+)/i, () => 'Windows'],
  [/Mac OS X/i, () => 'macOS'],
  [/Linux/i, () => 'Linux'],
];

/**
 * "WarehouseApp/1.2 (Android 15)" is the app on Android 15; a browser's agent is reduced to its system and browser.
 * Anything else is cut to a short plain text: the agent is data from the sign-in request, never layout.
 */
export function describeUserAgent(userAgent: string | null | undefined): DeviceSummary {
  // Control characters (a tab, a line break) are not part of a name.
  const text = Array.from(userAgent ?? '', c => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').trim();
  if (!text) return { app: '', system: '' };

  let system = '';
  for (const [pattern, name] of SYSTEMS) {
    const match = pattern.exec(text);
    if (match) {
      system = name(match);
      break;
    }
  }

  // A browser: Chrome, Firefox, Edge or Safari, with its major version.
  const browser = /\b(Edg|Firefox|Chrome|CriOS|Version)\/(\d+)/.exec(text);
  if (browser && /Mozilla\//.test(text)) {
    const name = browser[1] === 'Edg' ? 'Edge' : browser[1] === 'CriOS' ? 'Chrome' : browser[1] === 'Version' ? 'Safari' : browser[1];
    return { app: `${name} ${browser[2]}`, system };
  }

  // The app's own agent: Product/version, then the system in brackets.
  const product = /^([A-Za-z][\w.-]{0,40})\/([\w.+-]{1,20})/.exec(text);
  if (product) return { app: `${product[1]} ${product[2]}`, system };

  return { app: text.length > 40 ? `${text.slice(0, 40)}…` : text, system };
}

/** Whether the list still holds the session. */
export const stillListed = (sessions: readonly UserSession[], sessionId: string): boolean => sessions.some(session => session.id === sessionId);

export type RevokeOutcome =
  /** This phone's own session was revoked: sign out here. */
  | 'signedOutHere'
  /** The session is gone from the list. */
  | 'revoked'
  /** The server answered "done" but the session is still listed: it was not the caller's to revoke. */
  | 'notSignedOut';

/**
 * The server answers `{success:true, revoked_current:false}` both for a session it signed out and for one the caller may
 * not revoke (so the answer does not tell whether a session exists). The list read afterwards decides.
 */
export function revokeOutcome(revokedCurrent: boolean, listedAfter: readonly UserSession[], sessionId: string): RevokeOutcome {
  if (revokedCurrent) return 'signedOutHere';
  return stillListed(listedAfter, sessionId) ? 'notSignedOut' : 'revoked';
}
