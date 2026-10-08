import { beginOperatorMutation, getAuthenticatedClient } from '@/config/supabaseConfig';

export interface ImageDeletionResult {
  success: boolean;
  /**
   * The authorized metadata row is gone but the stored bytes were not
   * confirmed removed. Callers word this for the operator; the image no
   * longer belongs to the document either way.
   */
  partial?: boolean;
  error?: string;
}

export async function deleteWarehouseImage(
  kind: 'grn' | 'dispatch',
  imageId: string
): Promise<ImageDeletionResult> {
  let finishMutation: (() => void) | undefined;
  try {
    finishMutation = beginOperatorMutation();
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
        partial: true,
        error: 'Image access removed; storage path unavailable.',
      };
    const { data: removed, error: storageError } = await client.storage
      .from(`${kind}-images`)
      .remove([path]);
    if (storageError)
      return {
        success: false,
        partial: true,
        error: 'Image access removed; stored file cleanup failed.',
      };
    // Storage reports the objects it actually removed. An empty list means the
    // bytes are still there (already gone, or a policy refused the delete).
    if (!Array.isArray(removed) || removed.length === 0)
      return {
        success: false,
        partial: true,
        error: 'Image access removed; stored file was not confirmed deleted.',
      };
    return { success: true };
  } catch {
    return {
      success: false,
      error: 'Image deletion failed. Check your connection.',
    };
  } finally {
    finishMutation?.();
  }
}
