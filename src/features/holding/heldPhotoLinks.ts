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

/** Both helpers answer the bare path when they cannot sign; only a link carrying a token is a signed one. */
const isSigned = (url: string): boolean => url.includes('token=');

async function signed(photo: HeldPhoto): Promise<HeldPhotoView> {
  if (photo.path === null) return { ...photo, url: null };
  try {
    // The same signing as the GRN and dispatch photos: through the LAN-aware helpers, never a call of its own.
    const url = photo.role === 'dispatch' ? await getDispatchImageSignedUrl(photo.path, URL_SECONDS) : await getImageSignedUrl(photo.path, URL_SECONDS);
    return { ...photo, url: isSigned(url) ? url : null };
  } catch {
    return { ...photo, url: null };
  }
}

/** The item's photos and those of the `photos` items that go with it, each with a signed link (null when it could not be signed). */
export async function loadHeldPhotos(item: Pick<HeldItemDetail, 'photos' | 'photoFollowers'>): Promise<HeldPhotoView[]> {
  const more = await Promise.all(item.photoFollowers.map(id => getHeldItem(id).then(detail => detail.photos, () => [] as HeldPhoto[])));
  return Promise.all([...item.photos, ...more.flat()].map(signed));
}
