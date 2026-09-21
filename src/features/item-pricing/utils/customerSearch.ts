export interface ItemPricingCustomer {
  id: string;
  name: string;
}

interface CustomerSearchEnvelope {
  data?: unknown;
}

/**
 * Normalizes both supported search_customers response shapes.
 *
 * Older backends returned the customer array directly, while the current RPC
 * wraps it in a standardized `{ success, data }` response object.
 */
export function mapCustomerSearchResponse(
  response: unknown
): ItemPricingCustomer[] {
  const rows = Array.isArray(response)
    ? response
    : response !== null && typeof response === 'object'
      ? (response as CustomerSearchEnvelope).data
      : undefined;

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.flatMap((row) => {
    if (
      row === null ||
      typeof row !== 'object' ||
      typeof (row as { id?: unknown }).id !== 'string' ||
      typeof (row as { name?: unknown }).name !== 'string'
    ) {
      return [];
    }

    return [
      {
        id: (row as { id: string }).id,
        name: (row as { name: string }).name,
      },
    ];
  });
}
