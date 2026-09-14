import { getAuthenticatedClient } from '@/config/supabaseConfig';

export async function deleteWarehouseImage(
  kind: 'grn' | 'dispatch',
  imageId: string
) {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc(`delete_${kind}_image`, {
      p_image_id: imageId,
    });
    if (error || data?.success !== true)
      return { success: false, error: 'Image deletion was rejected.' };
    // Use the authorized RPC's path, never a signed URL containing a query token.
    const path = data.data?.storage_path;
    if (typeof path !== 'string' || !path)
      return {
        success: false,
        error: 'Image access removed; storage path unavailable.',
      };
    const { error: storageError } = await client.storage
      .from(`${kind}-images`)
      .remove([path]);
    if (storageError)
      return {
        success: false,
        error: 'Image access removed; stored file cleanup failed.',
      };
    return { success: true };
  } catch {
    return {
      success: false,
      error: 'Image deletion failed. Check your connection.',
    };
  }
}
