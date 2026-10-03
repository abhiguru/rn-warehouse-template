import { getGRNDispatchPresence } from '../dispatchPresence';

const response = (count: unknown) => ({
  data: { success: true, data: { grn: { dispatches_summary: { total_dispatches: count } } } },
  error: null,
});

test.each([0, 1, 4])('uses GRN-authorized history for dispatch count %s', async count => {
  const query = jest.fn().mockResolvedValue(response(count));
  await expect(getGRNDispatchPresence('grn-id', query)).resolves.toBe(count > 0);
  expect(query).toHaveBeenCalledWith('get_grn_details', { p_grn_id: 'grn-id' });
});

test.each([null, {}, { success: false }, response(-1).data,
  response('0').data, response(0.5).data])('refuses unavailable or malformed history', async data => {
  await expect(getGRNDispatchPresence('grn-id', jest.fn().mockResolvedValue({ data, error: null })))
    .rejects.toThrow('Unable to verify GRN dispatch history');
});

test('propagates authorization failure', async () => {
  await expect(getGRNDispatchPresence('grn-id', jest.fn().mockResolvedValue({
    data: null, error: { message: 'Active account required' },
  }))).rejects.toThrow('Active account required');
});
