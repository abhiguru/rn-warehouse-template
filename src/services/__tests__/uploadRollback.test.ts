import { rollbackPendingUpload } from '../uploadRollback';

const params = { rpc: 'cancel_grn_image_upload' as const, bucket: 'grn-images', imageId: 'image-1', storagePath: 'path-1' };

function client(cancel: () => unknown, removeAnswer: unknown = { data: [{ name: 'path-1' }], error: null }) {
  const remove = jest.fn(async () => removeAnswer);
  const rpc = jest.fn(async () => cancel());
  return { rpc, remove, storage: { from: jest.fn(() => ({ remove })) } } as any;
}

beforeEach(() => {
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('rollbackPendingUpload', () => {
  it('removes the object only after the server cancelled the pending row', async () => {
    const c = client(() => ({ data: { success: true, storage_path: 'path-1' }, error: null }));
    expect(await rollbackPendingUpload(c, params)).toEqual({ outcome: 'cancelled' });
    expect(c.rpc).toHaveBeenCalledWith('cancel_grn_image_upload', { p_image_id: 'image-1' });
    expect(c.storage.from).toHaveBeenCalledWith('grn-images');
    expect(c.remove.mock.calls).toEqual([[['path-1']]]);
  });

  it('still reports cancelled when the object removal fails', async () => {
    const c = client(() => ({ data: { success: true }, error: null }), { data: null, error: { message: 'denied' } });
    expect(await rollbackPendingUpload(c, params)).toEqual({ outcome: 'cancelled' });
  });

  it('keeps the object and returns the confirmed row when the upload is already confirmed', async () => {
    const c = client(() => ({
      data: { success: false, code: 'ALREADY_CONFIRMED', image_id: 'image-9', storage_path: 'path-9' },
      error: null,
    }));
    expect(await rollbackPendingUpload(c, params)).toEqual({ outcome: 'already_confirmed', imageId: 'image-9', storagePath: 'path-9' });
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('falls back to the known path and id when the server does not repeat them', async () => {
    const c = client(() => ({ data: { success: false, code: 'ALREADY_CONFIRMED' }, error: null }));
    expect(await rollbackPendingUpload(c, params)).toEqual({ outcome: 'already_confirmed', imageId: 'image-1', storagePath: 'path-1' });
  });

  it.each([
    ['not found', () => ({ data: { success: false, code: 'NOT_FOUND' }, error: null })],
    ['an error answer', () => ({ data: null, error: { message: 'Network request failed' } })],
    ['no answer', () => ({ data: null, error: null })],
    ['a throw', () => { throw new Error('Network request failed'); }],
  ])('keeps the object and says unknown on %s', async (_label, cancel) => {
    const c = client(cancel);
    expect(await rollbackPendingUpload(c, params)).toEqual({ outcome: 'unknown' });
    expect(c.remove).not.toHaveBeenCalled();
  });
});
