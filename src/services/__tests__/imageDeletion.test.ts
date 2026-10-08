import { beginOperatorMutation, getAuthenticatedClient } from '@/config/supabaseConfig';
import { deleteWarehouseImage } from '../imageDeletion';
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  beginOperatorMutation: jest.fn(),
}));
const remove = jest.fn();
const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(beginOperatorMutation).mockReturnValue(jest.fn());
  jest
    .mocked(getAuthenticatedClient)
    .mockResolvedValue({ rpc, storage: { from: () => ({ remove }) } } as any);
  rpc.mockResolvedValue({
    data: { success: true, data: { storage_path: 'authorized/photo.webp' } },
    error: null,
  });
  remove.mockResolvedValue({ data: [{ name: 'authorized/photo.webp' }], error: null });
});
it('holds the mutation lease until storage cleanup finishes', async () => {
  let finishStorage!: () => void;
  const release = jest.fn();
  jest.mocked(beginOperatorMutation).mockReturnValue(release);
  remove.mockImplementationOnce(() => new Promise(resolve => {
    finishStorage = () => resolve({ data: [{ name: 'authorized/photo.webp' }], error: null });
  }));
  const pending = deleteWarehouseImage('grn', 'image-id');
  await Promise.resolve();
  await Promise.resolve();
  expect(beginOperatorMutation).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  finishStorage();
  expect(await pending).toEqual({ success: true });
  expect(release).toHaveBeenCalledTimes(1);
});
it.each(['grn', 'dispatch'] as const)(
  'deletes %s bytes using the authenticated metadata response',
  async kind => {
    expect(await deleteWarehouseImage(kind, 'image-id')).toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith(`delete_${kind}_image`, {
      p_image_id: 'image-id',
    });
    expect(remove).toHaveBeenCalledWith(['authorized/photo.webp']);
  }
);
it('does not delete bytes after a business authorization rejection', async () => {
  rpc.mockResolvedValue({ data: { success: false }, error: null });
  expect(await deleteWarehouseImage('grn', 'image-id')).toEqual({
    success: false,
    error: 'Image deletion was rejected.',
  });
  expect(remove).not.toHaveBeenCalled();
});
it('reports incomplete cleanup instead of success when storage fails', async () => {
  remove.mockResolvedValue({ data: null, error: { message: 'Offline' } });
  expect(await deleteWarehouseImage('dispatch', 'image-id')).toEqual({
    success: false,
    partial: true,
    error: expect.stringMatching(/cleanup failed/),
  });
});
it.each([[[]], [null], [undefined]])(
  'reports a partial failure when storage removes nothing (%p) after the metadata row is gone',
  async removed => {
    remove.mockResolvedValue({ data: removed, error: null });
    const result = await deleteWarehouseImage('grn', 'image-id');
    expect(result).toEqual({
      success: false,
      partial: true,
      error: expect.stringMatching(/not confirmed deleted/),
    });
    expect(remove).toHaveBeenCalledWith(['authorized/photo.webp']);
  }
);
it('reports a partial failure when the authorized response carries no storage path', async () => {
  rpc.mockResolvedValue({ data: { success: true, data: {} }, error: null });
  expect(await deleteWarehouseImage('grn', 'image-id')).toEqual({
    success: false,
    partial: true,
    error: expect.stringMatching(/storage path unavailable/),
  });
  expect(remove).not.toHaveBeenCalled();
});
it('does not mark a transport failure as partial', async () => {
  rpc.mockRejectedValue(new Error('Network request failed'));
  expect(await deleteWarehouseImage('grn', 'image-id')).toEqual({
    success: false,
    error: 'Image deletion failed. Check your connection.',
  });
});
