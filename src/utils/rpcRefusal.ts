/**
 * A refusal that an RPC sent as its answer.
 *
 * Many of the facility's functions answer HTTP 200 even when they refuse:
 * access denied and the function's own exception handler both come back as a
 * body, either `{success:false, error|message, error_code}` or (older report
 * functions) `{error, summary:null}` with no `success` key. Read as data, that
 * body is an empty list or an empty report, so a caller has to tell it apart
 * before it reads anything else.
 */
export interface RpcRefusal {
  /** The server's own sentence, if it sent one. */
  text?: string;
  /** The server's error code (an SQLSTATE such as 42501), if it sent one. */
  code?: string;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** The first row when the RPC answered with an array, otherwise the body itself. */
export function rpcBody(data: unknown): any {
  return Array.isArray(data) ? data[0] : data;
}

/** The refusal an RPC body carries, or undefined when the body is an answer. */
export function rpcRefusal(data: unknown): RpcRefusal | undefined {
  const body = rpcBody(data);
  if (!body || typeof body !== 'object') return undefined;
  const refused = body.success === false || (body.success !== true && text(body.error) !== undefined);
  if (!refused) return undefined;
  return {
    text: text(body.error) ?? text(body.message),
    code: text(body.error_code) ?? text(body.code),
  };
}

/**
 * The code the app gives an access refusal that came without the server's
 * 42501 (refusedReport in src/services/reporting/reportEnvelope.ts). The
 * sentence shown with it is in the app's language and no longer names the
 * reason in English, so the code is what says it was a refusal.
 */
export const ACCESS_REFUSED_CODE = 'ACCESS_REFUSED';

/**
 * Codes that mean "this person may not have this": the server's SQLSTATE
 * 42501, the app's own code above, and the operations dashboard service's
 * STAFF_ONLY (its role check).
 */
const ACCESS_REFUSAL_CODES: ReadonlySet<string> = new Set(['42501', ACCESS_REFUSED_CODE, 'STAFF_ONLY']);

/**
 * True when the refusal is the server saying this person may not have what was
 * asked for: by its code, whatever language the sentence is in, or by the
 * server's own English words when no code came.
 */
export function isAccessRefusal(refusal: RpcRefusal): boolean {
  return (
    (refusal.code !== undefined && ACCESS_REFUSAL_CODES.has(refusal.code)) ||
    /access denied|permission|staff access required|role required/i.test(refusal.text ?? '')
  );
}
