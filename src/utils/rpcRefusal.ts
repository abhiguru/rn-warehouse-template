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

/** True when the refusal is the server saying this person may not have what was asked for. */
export function isAccessRefusal(refusal: RpcRefusal): boolean {
  return refusal.code === '42501' || /access denied|permission|staff access required|role required/i.test(refusal.text ?? '');
}
