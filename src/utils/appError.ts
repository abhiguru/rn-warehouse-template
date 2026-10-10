/**
 * Errors the app itself raises, identified by a code instead of their text.
 *
 * The message of an AppError is shown to people, so it is translated. Code that
 * has to decide something (offline or not, retry or not, sign in again or not)
 * reads `code` and never the message: the message changes with the language.
 *
 * Text that comes from the server stays English and is still matched by text
 * where it always was.
 *
 * This module has no dependencies, so the config, store and service layers can
 * all import it.
 */
export type AppErrorCode =
  /** No connection, or a request that could not be sent. */
  | 'NETWORK'
  /** A request the app gave up waiting for. */
  | 'TIMEOUT'
  /** There is no usable session: the person has to sign in. */
  | 'SIGN_IN_REQUIRED'
  /** A service call that needs a session was made without one. */
  | 'AUTH_REQUIRED'
  /** The app is moving to another facility's server. */
  | 'SERVER_SWITCH'
  /** The request belonged to a session that has since been replaced. */
  | 'SESSION_CHANGED';

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/** The code of an error the app raised; undefined for server and system errors. */
export function getAppErrorCode(error: unknown): AppErrorCode | undefined {
  if (error instanceof AppError) return error.code;
  if (typeof error === 'object' && error !== null) {
    const code = (error as { appErrorCode?: unknown }).appErrorCode;
    if (typeof code === 'string') return code as AppErrorCode;
  }
  return undefined;
}
