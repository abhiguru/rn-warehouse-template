/**
 * ImageOverlay - Full-screen image viewer with gesture support
 *
 * Uses react-native-image-viewing for smooth pinch-to-zoom and pan gestures.
 * Used for viewing GRN photos, dispatch images, and other uploaded media.
 *
 * Features:
 * - Smooth pinch-to-zoom with proper accumulation
 * - Double-tap to zoom
 * - Swipe to dismiss
 * - Image carousel navigation (previous/next)
 * - Loading indicator during image fetch
 *
 * @example
 * ```tsx
 * <ImageOverlay
 *   visible={showOverlay}
 *   images={uploadedImages}
 *   initialIndex={selectedIndex}
 *   onClose={() => setShowOverlay(false)}
 * />
 * ```
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import theme from '@/theme';

// Add logging for debugging image load issues
const LOG_PREFIX = '[ImageOverlay]';

export interface ImageData {
  id: string;
  imageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadTimestamp: string;
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed';
}

interface ImageOverlayProps {
  visible: boolean;
  images: ImageData[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImageOverlay: React.FC<ImageOverlayProps> = ({
  visible,
  images,
  initialIndex = 0,
  onClose,
}) => {
  // Convert images to format expected by react-native-image-viewing
  // P6 Fix: Memoize to prevent array recreation on every render
  const imageUrls = useMemo(() =>
    images.map(img => ({
      uri: img.imageUrl,
    })), [images]);

  // Custom header showing image count
  const renderHeader = (imageIndex: number) => (
    <View style={styles.header}>
      <Text style={styles.headerText}>
        {imageIndex + 1} / {images.length}
      </Text>
    </View>
  );

  // Custom footer showing filename
  const renderFooter = (imageIndex: number) => (
    <View style={styles.footer}>
      <Text style={styles.footerText} numberOfLines={1}>
        {images[imageIndex]?.fileName || 'Image'}
      </Text>
    </View>
  );

  // Loading indicator
  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={theme.colors.white} />
    </View>
  );

  if (!visible || images.length === 0) return null;

  if (__DEV__) console.log(`${LOG_PREFIX} Opening viewer with ${images.length} images at index ${initialIndex}`);

  return (
    <ImageViewing
      images={imageUrls}
      imageIndex={initialIndex}
      visible={visible}
      onRequestClose={onClose}
      HeaderComponent={({ imageIndex }) => renderHeader(imageIndex)}
      FooterComponent={({ imageIndex }) => renderFooter(imageIndex)}
      swipeToCloseEnabled={true}
      doubleTapToZoomEnabled={true}
      presentationStyle="overFullScreen"
    />
  );
};

const styles = StyleSheet.create({
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
  },
  headerText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
  },
  footerText: {
    color: theme.colors.white,
    fontSize: 14,
    opacity: 0.8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
