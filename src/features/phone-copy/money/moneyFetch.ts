/**
 * Asking the server for the dues or a statement and sorting what came back (WH-305, contract 4 rule 5 and 13): an answer
 * to keep, an access refusal, "Customer not found", or a failure with no answer. Used by the background pass and by the
 * two screens, so both decide the same way.
 */
import { getCustomerDues, getCustomerStatement, type CustomerDues, type CustomerStatement, type StatementResult } from '@/services/reporting/statement-service';
import { isAccessRefusal } from '@/utils/rpcRefusal';

export type MoneyFetched<T> =
  | { kind: 'answer'; data: T; body: Record<string, unknown>; asOf: string; today: string }
  | { kind: 'refused'; message: string | undefined }
  | { kind: 'notFound' }
  | { kind: 'failed'; message: string | undefined };

const NOT_FOUND = 'Customer not found';

/** The access refusal the service reported: the server's 42501 or the app's own code, or the server's own words. */
export function isRefusedResult(result: StatementResult<unknown>): boolean {
  const detail = typeof result.error === 'string' ? result.error : undefined;
  return isAccessRefusal({ code: detail, text: result.message }) || isAccessRefusal({ text: detail }) || isAccessRefusal({ text: result.serverReason });
}

function sort<T extends { as_of: string; today: string }>(result: StatementResult<T>): MoneyFetched<T> {
  if (result.success && result.data && result.body) {
    return { kind: 'answer', data: result.data, body: result.body, asOf: result.data.as_of, today: result.data.today };
  }
  if (isRefusedResult(result)) return { kind: 'refused', message: result.message };
  if (result.serverReason === NOT_FOUND) return { kind: 'notFound' };
  return { kind: 'failed', message: result.message };
}

export async function fetchDues(): Promise<MoneyFetched<CustomerDues>> {
  return sort(await getCustomerDues());
}

export async function fetchStatement(customerId: string): Promise<MoneyFetched<CustomerStatement>> {
  return sort(await getCustomerStatement(customerId));
}
