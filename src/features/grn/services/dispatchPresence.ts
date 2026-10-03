// Use the GRN-authorized summary rather than a dispatch-table read: staff may
// edit GRNs without receiving general dispatch-table access.
type DetailQuery = (name: 'get_grn_details', args: { p_grn_id: string }) =>
  PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function getGRNDispatchPresence(grnId: string, query: DetailQuery): Promise<boolean> {
  const { data, error } = await query('get_grn_details', { p_grn_id: grnId });
  if (error) throw new Error(error.message);
  const result = data as { success?: boolean; data?: { grn?: {
    dispatches_summary?: { total_dispatches?: unknown };
  } } } | null;
  const count = result?.data?.grn?.dispatches_summary?.total_dispatches;
  if (result?.success !== true || typeof count !== 'number' ||
      !Number.isInteger(count) || count < 0) {
    throw new Error('Unable to verify GRN dispatch history');
  }
  return count > 0;
}
