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
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Image, ImageProps, ImageContentFit } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';

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
        transition={200}
        placeholder={usePlaceholder ? { blurhash: PLACEHOLDER_BLURHASH } : undefined}
        placeholderContentFit="cover"
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />

      {/* Loading overlay */}
      {showLoading && isLoading && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}

      {/* Error overlay with retry */}
      {showError && hasError && (
        <TouchableOpacity style={styles.errorOverlay} onPress={handleRetry} activeOpacity={0.8}>
          <Icon name="image-off" size={24} color={theme.colors.gray[400]} />
          <Icon
            name="refresh"
            size={16}
            color={theme.colors.primary}
            style={styles.retryIcon}
          />
        </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: theme.colors.gray[100],
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.gray[100],
  },
  retryIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
});

export default CachedImage;
