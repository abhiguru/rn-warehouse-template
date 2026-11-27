/**
 * Links to the photos of a held item (WH-304): each file under `held/<held id>/` is signed from storage with the manager's own
 * storage read, as the GRN photos are. A photo storage will not sign has a null link.
 */
import { viaCurrentPath } from '@/config/lanTransport';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getHeldItem, type HeldItemDetail, type HeldPhoto } from './holdingApi';

const URL_SECONDS = 3600;

export interface HeldPhotoView extends HeldPhoto {
  /** A signed link, or null when storage would not give one. */
  url: string | null;
}

const bucketOf = (role: string): string => (role === 'dispatch' ? 'dispatch-images' : 'grn-images');

async function signed(photo: HeldPhoto): Promise<HeldPhotoView> {
  if (photo.path === null) return { ...photo, url: null };
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.storage.from(bucketOf(photo.role)).createSignedUrl(photo.path, URL_SECONDS);
    return { ...photo, url: error || !data.signedUrl ? null : viaCurrentPath(data.signedUrl) };
  } catch {
    return { ...photo, url: null };
  }
}

/** The item's photos and those of the `photos` items that go with it, each with a signed link (null when it could not be signed). */
export async function loadHeldPhotos(item: Pick<HeldItemDetail, 'photos' | 'photoFollowers'>): Promise<HeldPhotoView[]> {
  const more = await Promise.all(item.photoFollowers.map(id => getHeldItem(id).then(detail => detail.photos, () => [] as HeldPhoto[])));
  return Promise.all([...item.photos, ...more.flat()].map(signed));
}
