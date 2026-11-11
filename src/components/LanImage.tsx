import React from 'react';
import { Image, type ImageProps } from 'expo-image';
import { useLanPhotoUri } from '@/hooks/useLanStatus';

export type LanImageProps = Omit<ImageProps, 'source'> & { uri: string };

/**
 * An image view for a photo link that may be the facility's server (WH-133): on the warehouse network the photo is
 * fetched with a signed request, checked, and shown from a file (src/config/lanPhotos.ts); otherwise the link is shown.
 */
export function LanImage({ uri, ...rest }: LanImageProps) {
  const shown = useLanPhotoUri(uri);
  return <Image source={shown ? { uri: shown } : undefined} {...rest} />;
}
