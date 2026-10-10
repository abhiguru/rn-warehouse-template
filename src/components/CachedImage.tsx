/**
 * CachedImage Component
 *
 * P8 Fix: Wrapper around expo-image with proper caching defaults.
 * Provides consistent caching behavior, placeholders, and error handling.
 *
 * Features:
 * - Memory + disk caching by default
 * - Placeholder support
 * - Loading state indicator
 * - Error state with retry
 * - Smooth transition animations
 *
 * Placeholder per docs/STYLE_GUIDE.md §13.10: surface.cardActive with an
 * image-outline icon in icon.secondary while loading or after a failure.
 * Pass `borderRadius: radius.card` in `style` when used in a grid.
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Image, ImageProps, ImageContentFit } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, motion, radius, space } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

// Placeholder image as base64 (gray background with image icon)
const PLACEHOLDER_BLURHASH = '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7teleayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';

export interface CachedImageProps extends Omit<ImageProps, 'source'> {
  /** Image URI */
  uri: string;
  /** Fallback URI if primary fails */
  fallbackUri?: string;
  /** Show loading indicator */
  showLoading?: boolean;
  /** Show error state with retry */
  showError?: boolean;
  /** Called when image loads successfully */
  onLoadSuccess?: () => void;
  /** Called when image fails to load */
  onLoadError?: (error: Error) => void;
  /** Content fit mode */
  contentFit?: ImageContentFit;
  /** Enable placeholder blur hash */
  usePlaceholder?: boolean;
}

export function CachedImage({
  uri,
  fallbackUri,
  showLoading = true,
  showError = true,
  onLoadSuccess,
  onLoadError,
  contentFit = 'cover',
  usePlaceholder = true,
  style,
  ...rest
}: CachedImageProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentUri, setCurrentUri] = useState(uri);
  const [retryCount, setRetryCount] = useState(0);

  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
  }, []);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onLoadSuccess?.();
  }, [onLoadSuccess]);

  const handleError = useCallback(
    (error: { error: string }) => {
      setIsLoading(false);

      // Try fallback URI if available
      if (fallbackUri && currentUri !== fallbackUri) {
        if (__DEV__) {
          if (__DEV__) console.log('[CachedImage] Primary failed, trying fallback:', fallbackUri);
        }
        setCurrentUri(fallbackUri);
        return;
      }

      setHasError(true);
      onLoadError?.(new Error(error.error));
    },
    [fallbackUri, currentUri, onLoadError]
  );

  const handleRetry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
    setCurrentUri(uri);
    setHasError(false);
    setIsLoading(true);
  }, [uri]);

  // Add retry count to URI to bust cache on retry
  const sourceUri = retryCount > 0 ? `${currentUri}?retry=${retryCount}` : currentUri;

  return (
    <View style={[styles.container, style]}>
      <Image
        source={{ uri: sourceUri }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        transition={motion.standard}
        placeholder={usePlaceholder ? { blurhash: PLACEHOLDER_BLURHASH } : undefined}
        placeholderContentFit="cover"
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />

      {/* Loading placeholder */}
      {showLoading && isLoading && !hasError && !usePlaceholder && (
        <View
          style={styles.placeholder}
          accessible
          accessibilityLabel={tr('components.image.loading')}
          accessibilityState={{ busy: true }}
        >
          <Icon name="image-outline" size={iconSize.lg} color={t.icon.secondary} />
        </View>
      )}

      {/* Failure placeholder with retry */}
      {showError && hasError && (
        <Pressable
          style={({ pressed }) => [styles.placeholder, pressed && styles.placeholderPressed]}
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel={tr('components.image.loadFailedRetry')}
        >
          <Icon name="image-off-outline" size={iconSize.lg} color={t.icon.secondary} />
          <View style={styles.retryBadge}>
            <Icon name="refresh" size={iconSize.sm} color={t.brand.tint} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Preload images into cache for faster display later.
 * Useful for prefetching images before they're displayed.
 *
 * @param uris - Array of image URIs to preload
 */
export async function preloadImages(uris: string[]): Promise<void> {
  const validUris = uris.filter((uri) => uri && typeof uri === 'string');

  if (validUris.length === 0) return;

  try {
    await Image.prefetch(validUris);
    if (__DEV__) {
      if (__DEV__) console.log(`[CachedImage] Preloaded ${validUris.length} images`);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[CachedImage] Preload failed:', error);
    }
  }
}

/**
 * Clear the image cache.
 * Useful for freeing up disk space or forcing fresh downloads.
 */
export async function clearImageCache(): Promise<void> {
  try {
    await Image.clearDiskCache();
    await Image.clearMemoryCache();
    if (__DEV__) {
      if (__DEV__) console.log('[CachedImage] Cache cleared');
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[CachedImage] Failed to clear cache:', error);
    }
  }
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    overflow: 'hidden' as const,
    backgroundColor: t.surface.cardActive,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface.cardActive,
  },
  placeholderPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  retryBadge: {
    position: 'absolute' as const,
    bottom: space.xs,
    right: space.xs,
    padding: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: t.surface.card,
  },
});

export default CachedImage;
