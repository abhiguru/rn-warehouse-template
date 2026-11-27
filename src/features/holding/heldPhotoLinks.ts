/**
 * Links to the photos of a held item (WH-304): each file under `held/<held id>/` is signed from storage with the manager's own
 * storage read, as the GRN photos are. A photo storage will not sign has a null link.
 */
import { getDispatchImageSignedUrl } from '@/features/dispatch/services/dispatchImageService';
import { getImageSignedUrl } from '@/features/grn/services/imageUploadService';
import { getHeldItem, type HeldItemDetail, type HeldPhoto } from './holdingApi';

const URL_SECONDS = 3600;

export interface HeldPhotoView extends HeldPhoto {
  /** A signed link, or null when storage would not give one. */
  url: string | null;
}

/** Both helpers answer the bare path, or the unsigned storage address, when they cannot sign: neither is a link that opens. */
const isUnsigned = (url: string, path: string): boolean => url === path || (url.includes('/storage/v1/object/') && !url.includes('/storage/v1/object/sign/'));

async function signed(photo: HeldPhoto): Promise<HeldPhotoView> {
  if (photo.path === null) return { ...photo, url: null };
  try {
    // The same signing as the GRN and dispatch photos: through the LAN-aware helpers, never a call of its own.
    const url = photo.role === 'dispatch' ? await getDispatchImageSignedUrl(photo.path, URL_SECONDS) : await getImageSignedUrl(photo.path, URL_SECONDS);
    return { ...photo, url: isUnsigned(url, photo.path) ? null : url };
  } catch {
    return { ...photo, url: null };
  }
}

/** The item's photos and those of the `photos` items that go with it, each with a signed link (null when it could not be signed). */
export async function loadHeldPhotos(item: Pick<HeldItemDetail, 'photos' | 'photoFollowers'>): Promise<HeldPhotoView[]> {
  const more = await Promise.all(item.photoFollowers.map(id => getHeldItem(id).then(detail => detail.photos, () => [] as HeldPhoto[])));
  return Promise.all([...item.photos, ...more.flat()].map(signed));
}
