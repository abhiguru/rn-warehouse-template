/**
 * What a report RPC answered, before a service maps it.
 *
 * The report functions answer HTTP 200 even when they refuse (see
 * `@/utils/rpcRefusal`). Read as data, that body is a report with nothing in
 * it, so every reporting service asks for the refusal first.
 */
import { serverText } from '@/utils/serverText';
import { ACCESS_REFUSED_CODE, rpcBody, rpcRefusal, isAccessRefusal, type RpcRefusal } from '@/utils/rpcRefusal';

export { rpcBody as reportBody, rpcRefusal as reportRefusal, isAccessRefusal };

/**
 * The machine code of a refusal. An access refusal always has one that
 * `isAccessRefusal` reads: the server's 42501 when it sent it, otherwise
 * ACCESS_REFUSED. The message beside it is in the app's language (in Gujarati
 * the server's English words are gone), so the code alone must say what it was.
 */
function refusalCode(refusal: RpcRefusal): string {
  if (isAccessRefusal(refusal)) return refusal.code === '42501' ? refusal.code : ACCESS_REFUSED_CODE;
  return refusal.code ?? 'REPORT_REFUSED';
}

/** The failed service answer for a refusal: the server's reason in the app's language, and its code. */
export function refusedReport<T>(refusal: RpcRefusal, empty: T, fallback: string) {
  return {
    success: false as const,
    data: empty,
    message: serverText(refusal.text, fallback),
    error: refusalCode(refusal),
  };
}
