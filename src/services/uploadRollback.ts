import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('upload-rollback');

export type CancelUploadRpc = 'cancel_grn_image_upload' | 'cancel_dispatch_image_upload';

export type RollbackOutcome = 'cancelled' | 'already_confirmed' | 'unknown';

export interface RollbackResult {
  outcome: RollbackOutcome;
  /** Set for 'already_confirmed': the path the server says the confirmed row uses. */
  storagePath?: string;
  /** Set for 'already_confirmed': the confirmed row's id. */
  imageId?: string;
}

/** The part of the Supabase client the rollback needs. */
interface RollbackClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{ data: unknown; error: any }>;
    };
  };
}

/**
 * Undo a photo upload that failed or whose answer was lost.
 *
 * The cancel RPC is asked first and its answer is read: the Storage object is
 * removed only when the server says it cancelled a pending row. If the row was
 * already confirmed (the confirm committed but its answer was lost) the bytes
 * are kept, because a confirmed row points at them. Any other answer (not
 * found, an error, a thrown error) also keeps the bytes: an orphan file is
 * harmless, a deleted attached photo is not.
 */
export const rollbackPendingUpload = async (
  client: RollbackClient,
  params: {
    rpc: CancelUploadRpc;
    bucket: string;
    imageId: string;
    storagePath: string;
  }
): Promise<RollbackResult> => {
  const { rpc, bucket, imageId, storagePath } = params;

  let data: any;
  try {
    const answer = await client.rpc(rpc, { p_image_id: imageId });
    if (answer.error) {
      log.warn('Cancel of pending upload failed, keeping the file', loggableError(answer.error));
      return { outcome: 'unknown' };
    }
    data = answer.data;
  } catch (cancelError) {
    log.warn('Failed to cancel pending record, keeping the file', loggableError(cancelError));
    return { outcome: 'unknown' };
  }

  if (data?.success === true) {
    try {
      const { data: removed, error } = await client.storage.from(bucket).remove([storagePath]);
      if (error || (Array.isArray(removed) && removed.length === 0)) {
        log.warn('Partial upload was not removed', loggableError(error));
      }
    } catch (removeError) {
      log.warn('Failed to remove partial upload', loggableError(removeError));
    }
    return { outcome: 'cancelled' };
  }

  if (data?.code === 'ALREADY_CONFIRMED') {
    return {
      outcome: 'already_confirmed',
      storagePath: typeof data.storage_path === 'string' ? data.storage_path : storagePath,
      imageId: typeof data.image_id === 'string' ? data.image_id : imageId,
    };
  }

  log.warn('Pending upload could not be cancelled, keeping the file', { code: data?.code });
  return { outcome: 'unknown' };
};
