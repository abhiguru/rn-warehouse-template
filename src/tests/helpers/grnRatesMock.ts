/**
 * Stand-ins for the Rates section's data in tests of the GRN Review step that are not about rates:
 * every item has a default rate, so nothing blocks the save.
 */
export const grnRatesModuleMock = () => ({
  useGrnRates: (itemIds: string[]) => ({
    rates: [...new Set(itemIds)].map((id, n) => ({
      id: `rate-${n}`, item_id: id, item_name: id, customer_id: null, customer_name: null, price_type: 'monthly',
      unit_price: 5, weight_min: 0, weight_max: 1000, labour_rate: 1, tax_percent: 5,
      effective_from: '2000-01-01', effective_to: null, created_at: '', created_by: '',
    })),
    status: 'ready',
    offline: false,
    refresh: async () => {},
  }),
});
