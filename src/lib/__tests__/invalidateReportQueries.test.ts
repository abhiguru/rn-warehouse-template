/**
 * invalidateReportQueries marks every report answer out of date and leaves other lists alone
 * (SR-10: a report underneath a saved document must ask again).
 */
import { invalidateReportQueries, queryClient } from '../queryClient';

afterEach(() => queryClient.clear());

describe('invalidateReportQueries', () => {
  it('marks every report key out of date and no other key', async () => {
    queryClient.setQueryData(['report', 'stock-summary', 'customer', 'c-1'], { total: 4 });
    queryClient.setQueryData(['report', 'grn-activity', 'customers', '2026-10-01'], { rows: [] });
    queryClient.setQueryData(['grn', 'list', {}], { rows: [] });

    await invalidateReportQueries();

    const cache = queryClient.getQueryCache();
    expect(cache.find({ queryKey: ['report', 'stock-summary', 'customer', 'c-1'] })?.state.isInvalidated).toBe(true);
    expect(cache.find({ queryKey: ['report', 'grn-activity', 'customers', '2026-10-01'] })?.state.isInvalidated).toBe(true);
    expect(cache.find({ queryKey: ['grn', 'list', {}] })?.state.isInvalidated).toBe(false);
    // The answers themselves stay until the facility gives new ones.
    expect(queryClient.getQueryData(['report', 'stock-summary', 'customer', 'c-1'])).toEqual({ total: 4 });
  });
});
