/**
 * Whether a customer is deactivated, for the rate screens: a deactivated customer's rates are read only
 * (Customers -> a customer -> Pricing, and the customer's rate page). `null` until the answer is in and when it
 * cannot be read: unknown is treated as NOT writable, and the server decides again on every save.
 * `known` is an answer the caller already has (a route param); it is used at once, the read is the fallback.
 * `failed` says the read was tried and did not answer, `retry` reads again.
 */
import { useCallback, useEffect, useState } from 'react';
import { customerService } from '@/services/customer-service';

export interface CustomerDeactivatedState {
  deactivated: boolean | null;
  failed: boolean;
  retry: () => void;
}

export function useCustomerDeactivatedState(customerId: string, known?: boolean | null): CustomerDeactivatedState {
  const [state, setState] = useState<{ id: string; deactivated: boolean } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setState(null);
    setFailedFor(null);
    if (!customerId || typeof known === 'boolean') return;
    let ignore = false;
    void (async () => {
      try {
        const result = await customerService.getCustomerById(customerId);
        if (ignore) return;
        if (result.success && result.data) setState({ id: customerId, deactivated: result.data.active === false });
        else setFailedFor(customerId);
      } catch {
        // Unreadable: stays unknown, so the rates stay read only, and the screen says so.
        if (!ignore) setFailedFor(customerId);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [customerId, known, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  if (typeof known === 'boolean') return { deactivated: known, failed: false, retry };
  const deactivated = state && state.id === customerId ? state.deactivated : null;
  return { deactivated, failed: deactivated === null && failedFor === customerId, retry };
}

export function useCustomerDeactivated(customerId: string, known?: boolean | null): boolean | null {
  return useCustomerDeactivatedState(customerId, known).deactivated;
}
