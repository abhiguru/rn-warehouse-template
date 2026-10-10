/**
 * What a report RPC answered, before a service maps it.
 *
 * The report functions answer HTTP 200 even when they refuse (see
 * `@/utils/rpcRefusal`). Read as data, that body is a report with nothing in
 * it, so every reporting service asks for the refusal first.
 */
import { serverText } from '@/utils/serverText';
import { rpcBody, rpcRefusal, isAccessRefusal, type RpcRefusal } from '@/utils/rpcRefusal';

export { rpcBody as reportBody, rpcRefusal as reportRefusal, isAccessRefusal };

/** The failed service answer for a refusal: the server's reason in the app's language. */
export function refusedReport<T>(refusal: RpcRefusal, empty: T, fallback: string) {
  return {
    success: false as const,
    data: empty,
    message: serverText(refusal.text, fallback),
    error: refusal.code ?? 'REPORT_REFUSED',
  };
}
