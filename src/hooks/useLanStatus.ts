import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getLanStatus, subscribeLanStatus, toCanonicalUrl, viaCurrentPath, type LanStatus } from '@/config/lanTransport';
import { isLanPhotoUrl, resolveLanPhoto } from '@/config/lanPhotos';

/** Which path requests go over (internet or warehouse network), the LAN address in use, and whether the fallback has a problem. */
export function useLanStatus(): LanStatus {
  return useSyncExternalStore(subscribeLanStatus, getLanStatus, getLanStatus);
}

/**
 * What an image view should open for a photo link, per link. On the internet path (and for a link that is not the
 * facility's) it is the link itself. On the warehouse network (WH-133) it is the file of the photo, fetched with a signed
 * request and checked; `null` while that is under way. A photo that could not be fetched there is its link, which fails
 * quietly. Worked out again whenever the path changes.
 */
export function useLanPhotoUris(urls: readonly (string | undefined)[]): (string | null)[] {
  const { path } = useLanStatus();
  const key = urls.join('\n');
  const [files, setFiles] = useState<Record<string, string>>({});
  const onLan = path === 'lan';
  useEffect(() => {
    if (!onLan) return undefined;
    let live = true;
    for (const url of key.split('\n')) {
      if (!isLanPhotoUrl(url)) continue;
      void resolveLanPhoto(url).then(file => {
        if (live) setFiles(known => (known[url] === (file ?? url) ? known : { ...known, [url]: file ?? url }));
      });
    }
    return () => {
      live = false;
    };
  }, [onLan, key]);
  // Stable between renders unless a link, the path or a file changes.
  return useMemo(() => key.split('\n').map(url => {
    if (!url) return null;
    if (!onLan || !isLanPhotoUrl(url)) return viaCurrentPath(toCanonicalUrl(url));
    return files[url] ?? null;
  }), [key, onLan, files]);
}

/** One photo link as `useLanPhotoUris` works it out; `null` while a photo is being fetched over the warehouse network. */
export function useLanPhotoUri(url: string | undefined): string | null {
  return useLanPhotoUris([url])[0];
}

/**
 * A link to a file on the facility's server (a signed photo URL) as an image view should open it. It follows the path
 * (WS-L review L6), and on the warehouse network it is the checked file of the photo, or '' while that is under way.
 */
export function useViaCurrentPath(url: string): string {
  return useLanPhotoUri(url) ?? '';
}
