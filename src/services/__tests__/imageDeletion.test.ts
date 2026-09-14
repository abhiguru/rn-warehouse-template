import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { deleteWarehouseImage } from '../imageDeletion';
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
}));
const remove = jest.fn();
const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(getAuthenticatedClient)
    .mockResolvedValue({ rpc, storage: { from: () => ({ remove }) } } as any);
  rpc.mockResolvedValue({
    data: { success: true, data: { storage_path: 'authorized/photo.webp' } },
    error: null,
  });
  remove.mockResolvedValue({ error: null });
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
  expect((await deleteWarehouseImage('grn', 'image-id')).success).toBe(false);
  expect(remove).not.toHaveBeenCalled();
});
it('reports incomplete cleanup instead of success when storage fails', async () => {
  remove.mockResolvedValue({ error: { message: 'Offline' } });
  expect((await deleteWarehouseImage('dispatch', 'image-id')).success).toBe(
    false
  );
});
