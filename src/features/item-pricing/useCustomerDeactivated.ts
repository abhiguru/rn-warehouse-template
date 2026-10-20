/**
 * Whether a customer is deactivated, for the rate screens: a deactivated customer's rates are read only
 * (Customers -> a customer -> Pricing, and the customer's rate page). `null` until the answer is in and when it
 * cannot be read: unknown is treated as NOT writable, and the server decides again on every save.
 * `known` is an answer the caller already has (a route param); it is used at once, the read is the fallback.
 */
import { useEffect, useState } from 'react';
import { customerService } from '@/services/customer-service';

export function useCustomerDeactivated(customerId: string, known?: boolean | null): boolean | null {
  const [state, setState] = useState<{ id: string; deactivated: boolean } | null>(null);
  useEffect(() => {
    setState(null);
    if (!customerId || typeof known === 'boolean') return;
    let ignore = false;
    void (async () => {
      try {
        const result = await customerService.getCustomerById(customerId);
        if (!ignore && result.success && result.data) setState({ id: customerId, deactivated: result.data.active === false });
      } catch {
        // Unreadable: stays unknown, so the rates stay read only.
      }
    })();
    return () => {
      ignore = true;
    };
  }, [customerId, known]);
  if (typeof known === 'boolean') return known;
  return state && state.id === customerId ? state.deactivated : null;
}
