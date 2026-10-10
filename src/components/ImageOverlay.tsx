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
 * - Close button and image counter in overlay.onImage on an overlay.scrim
 *   bar, over the overlay.imageBackdrop (docs/STYLE_GUIDE.md §13.10)
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
import { View, Text, Pressable } from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

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

const makeStyles = (t: ThemeTokens) => ({
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    backgroundColor: t.overlay.scrim,
  },
  headerSide: {
    width: touchTarget,
  },
  headerText: {
    ...typography.headline,
    fontVariant: ['tabular-nums' as const],
    flex: 1,
    textAlign: 'center' as const,
    color: t.overlay.onImage,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: touchTarget / 2,
  },
  closeButtonPressed: {
    backgroundColor: t.interaction.pressedOverlay,
  },
  footer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.lg,
    backgroundColor: t.overlay.scrim,
    alignItems: 'center' as const,
  },
  footerText: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.overlay.onImage,
  },
});

export const ImageOverlay: React.FC<ImageOverlayProps> = ({
  visible,
  images,
  initialIndex = 0,
  onClose,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  // Convert images to format expected by react-native-image-viewing
  // P6 Fix: Memoize to prevent array recreation on every render
  const imageUrls = useMemo(() =>
    images.map(img => ({
      uri: img.imageUrl,
    })), [images]);

  // Header: close button and image counter
  const renderHeader = (imageIndex: number) => (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel={tr('components.imageOverlay.close')}
        hitSlop={space.xs}
      >
        <Icon name="close" size={iconSize.lg} color={t.overlay.onImage} />
      </Pressable>
      <Text
        style={styles.headerText}
        accessibilityLabel={tr('components.imageOverlay.positionLabel', { current: imageIndex + 1, total: images.length })}
      >
        {tr('components.imageOverlay.position', { current: imageIndex + 1, total: images.length })}
      </Text>
      <View style={styles.headerSide} />
    </View>
  );

  // Footer: file name
  const renderFooter = (imageIndex: number) => (
    <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
      <Text style={styles.footerText} numberOfLines={1}>
        {images[imageIndex]?.fileName || tr('common.photo')}
      </Text>
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
      backgroundColor={t.overlay.imageBackdrop}
      HeaderComponent={({ imageIndex }) => renderHeader(imageIndex)}
      FooterComponent={({ imageIndex }) => renderFooter(imageIndex)}
      swipeToCloseEnabled={true}
      doubleTapToZoomEnabled={true}
      presentationStyle="overFullScreen"
    />
  );
};
