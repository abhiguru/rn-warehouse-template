interface CustomerOrderTargetInput {
  explicitCustomerId?: string;
  assignedCustomerIds?: string[];
  orderCustomerIds?: string[];
}

/**
 * Resolve a customer account's only authorized order target without invoking
 * staff-only customer search. Multiple assignments deliberately return null so
 * the caller can present an authorized selector rather than guessing.
 */
export const resolveCustomerOrderTarget = ({
  explicitCustomerId,
  assignedCustomerIds = [],
  orderCustomerIds = [],
}: CustomerOrderTargetInput): string | null => {
  const ids = new Set(
    [explicitCustomerId, ...assignedCustomerIds, ...orderCustomerIds].filter(
      (id): id is string => Boolean(id)
    )
  );
  return ids.size === 1 ? [...ids][0] : null;
};
