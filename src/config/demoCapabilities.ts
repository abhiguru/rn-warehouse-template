// Scope is limited to the source-demo integrations recorded in docs/HISTORY.md.
export const DEMO_CAPABILITIES = {
  printing: false,
  sensors: false,
  realtime: true, // Order/cart invalidation only; no stock/invoice subscriptions.
  customerDocuments: false,
} as const;
