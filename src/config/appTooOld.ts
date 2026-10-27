import { registerSessionScoped } from './sessionScopedRegistry';

/**
 * The facility needs a newer app than this one: `minimumClientVersion` of its public configuration is above
 * this build's version (docs/API_CONTRACT.md, "Which app builds a release supports"). Thrown by discovery
 * (operatorServer.ts) and told apart from "cannot reach the facility" by `code`, so both sign-in paths show the
 * "Update the app" screen (src/components/AppTooOldScreen.tsx) and not a connection message.
 */
export const APP_TOO_OLD = 'app_too_old' as const;

export class AppTooOldError extends Error {
  readonly code = APP_TOO_OLD;
  constructor(
    message: string,
    /** The oldest app version the facility answers, `MAJOR.MINOR.PATCH`. */
    readonly minimum: string,
    /** This build's version. */
    readonly current: string,
    /** The build's public Google Play listing (`updateUrlOf`, operatorServer.ts); absent when its application id is not a real one. */
    readonly updateUrl?: string
  ) {
    super(message);
    this.name = 'AppTooOldError';
  }
}

export const isAppTooOld = (error: unknown): error is AppTooOldError =>
  error instanceof AppTooOldError ||
  (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === APP_TOO_OLD);

/** What the screen shows: the two versions and the update link, if there is one. */
export type AppTooOldInfo = { minimum: string; current: string; updateUrl?: string };

export const appTooOldInfo = (error: AppTooOldError): AppTooOldInfo => ({
  minimum: error.minimum,
  current: error.current,
  ...(error.updateUrl ? { updateUrl: error.updateUrl } : {}),
});

/**
 * The facility the phone is signed in to now needs a newer app: set by the identity check of the ACTIVE facility
 * (src/config/operatorBootstrap.ts: cold start, return to the foreground), so a phone that was resumed after an upgrade is
 * told too, and not left with screens that each fail on their own. `BootstrapApp` (app/_layout.tsx) shows the "Update the
 * app" screen while it is set. A check that succeeds, a new bootstrap, or leaving the facility clears it.
 */
let tooOld: AppTooOldInfo | null = null;
const listeners = new Set<() => void>();
export const getAppTooOld = (): AppTooOldInfo | null => tooOld;
export const subscribeAppTooOld = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function setAppTooOld(next: AppTooOldInfo | null): void {
  if (tooOld === next || (tooOld && next && tooOld.minimum === next.minimum && tooOld.current === next.current && tooOld.updateUrl === next.updateUrl)) return;
  tooOld = next;
  for (const listener of [...listeners]) listener();
}
export const reportAppTooOld = (error: AppTooOldError): void => setAppTooOld(appTooOldInfo(error));
export const clearAppTooOld = (): void => setAppTooOld(null);
// The screen is about the facility the phone is signed in to; logout, forced logout, account deletion and a server switch end it.
// Not on every generation change: a token refresh must not lift the screen while the facility still needs a newer app.
registerSessionScoped('app-too-old', () => clearAppTooOld());
