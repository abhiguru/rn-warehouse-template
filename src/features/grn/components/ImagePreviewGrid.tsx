import React, { useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Text,
  Dimensions,
  ActivityIndicator,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { deleteGRNImage } from '../services/imageUploadService';
import { getSupabaseClient } from '@/config/supabaseConfig';

import { showAlert } from '@/utils/alert';
interface ImagePreviewGridProps {
  // Legacy support for string URLs
  images?: string[];
  onRemove?: (index: number) => void;

  // Enhanced support for image metadata
  imageData?: GRNImageData[];
  onRemoveImage?: (imageId: string) => void;
  onImagePress?: (imageData: GRNImageData) => void;

  // Configuration
  maxImages?: number;
  editable?: boolean;
  columns?: number;
  showMetadata?: boolean;
  showProgress?: boolean;
}

const { width: screenWidth } = Dimensions.get('window');
/** Gap between thumbnails (docs/STYLE_GUIDE.md 13.10). */
const GRID_GAP = space.xs;

export const ImagePreviewGrid: React.FC<ImagePreviewGridProps> = ({
  // Legacy props
  images = [],
  onRemove,

  // Enhanced props
  imageData = [],
  onRemoveImage,
  onImagePress,

  // Configuration
  maxImages = 10,
  editable = true,
  columns = 3,
  showMetadata = false,
  showProgress = true,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());
  // Measured grid width; falls back to the screen width minus the side margins.
  const [gridWidth, setGridWidth] = useState<number | null>(null);

  // Use enhanced imageData if available, otherwise fall back to legacy images
  const rawImages = imageData.length > 0 ? imageData : images.map(url => ({
    id: url,
    imageUrl: url,
    fileName: 'image.jpg',
    fileSize: 0,
    mimeType: 'image/jpeg',
    uploadTimestamp: new Date().toISOString(),
    uploadStatus: 'completed' as const,
  }));

  // Filter out images with empty/invalid URLs to prevent load errors
  const effectiveImages = rawImages.filter(img => {
    if (!img.imageUrl || img.imageUrl.trim() === '') {
      console.warn('[ImagePreviewGrid] Skipping image with empty URL:', { id: img.id, storagePath: (img as GRNImageData).storagePath });
      return false;
    }
    return true;
  });

  // Only log when there are actual images to prevent log spam
  if (effectiveImages.length > 0 || rawImages.length !== effectiveImages.length) {
    console.log('[ImagePreviewGrid] Rendering images:', {
      imageDataLength: imageData.length,
      rawImagesLength: rawImages.length,
      effectiveImagesLength: effectiveImages.length,
      skippedCount: rawImages.length - effectiveImages.length,
      effectiveImages: effectiveImages.map(img => ({
        id: img.id,
        url: img.imageUrl?.substring(0, 50) + '...',
        status: img.uploadStatus
      }))
    });
  }

  const availableWidth = gridWidth ?? screenWidth - 2 * space.lg;
  const imageSize = Math.floor((availableWidth - (columns - 1) * GRID_GAP) / columns);
  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== gridWidth) setGridWidth(width);
  };

  const handleRemove = (index: number) => {
    if (!editable || !onRemove) return;

    showAlert(
      'Remove photo?',
      'You can add it again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove photo',
          style: 'destructive',
          onPress: () => onRemove(index),
        },
      ]
    );
  };

  const handleRemoveImage = async (imageData: GRNImageData) => {
    if (!editable) return;

    const imageId = imageData.id || imageData.imageUrl;

    console.log('[ImagePreviewGrid] 🗑️ Delete requested for image:', {
      imageId,
      hasDbId: !!imageData.id,
      dbId: imageData.id,
      uploadStatus: imageData.uploadStatus,
      storagePath: imageData.storagePath,
      imageUrl: imageData.imageUrl?.substring(0, 80) + '...',
    });

    showAlert(
      'Remove photo?',
      'You can add it again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove photo',
          style: 'destructive',
          onPress: async () => {
            if (!imageId) return;

            setDeletingImages(prev => new Set(prev).add(imageId));

            try {
              // If image has a database ID, delete from backend
              if (imageData.id && imageData.uploadStatus === 'completed') {
                console.log('[ImagePreviewGrid] 🗑️ Calling deleteGRNImage RPC for:', imageData.id);
                const result = await deleteGRNImage(imageData.id, imageData.imageUrl);
                console.log('[ImagePreviewGrid] 🗑️ deleteGRNImage result:', result);
                if (!result.success) {
                  // Log but continue - we'll still remove from UI
                  console.warn('[ImagePreviewGrid] ⚠️ Backend delete failed, will remove from local state only:', result.error);
                }
              } else {
                console.log('[ImagePreviewGrid] 🗑️ Skipping backend delete (no DB ID or not completed)');
              }

              // Notify parent component to remove from Redux state
              console.log('[ImagePreviewGrid] 🗑️ Notifying parent to remove image from state');
              if (onRemoveImage) {
                console.log('[ImagePreviewGrid] 🗑️ Calling onRemoveImage with:', imageId);
                onRemoveImage(imageId);
              } else if (onRemove) {
                // Legacy support
                const index = effectiveImages.findIndex(img =>
                  (img.id || img.imageUrl) === imageId
                );
                console.log('[ImagePreviewGrid] 🗑️ Calling legacy onRemove with index:', index);
                if (index >= 0) {
                  onRemove(index);
                }
              } else {
                console.warn('[ImagePreviewGrid] ⚠️ No remove handler provided!');
              }
            } catch (error) {
              console.error('[ImagePreviewGrid] Delete error:', error);
              showAlert(
                "Couldn't remove the photo",
                'Check your connection and try again.'
              );
            } finally {
              setDeletingImages(prev => {
                const newSet = new Set(prev);
                newSet.delete(imageId);
                return newSet;
              });
            }
          },
        },
      ]
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (effectiveImages.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.grid} onLayout={handleLayout}>
        {effectiveImages.map((imageData, index) => {
          const imageId = imageData.id || imageData.imageUrl;
          const isDeleting = deletingImages.has(imageId);
          const isUploading = imageData.uploadStatus === 'uploading';
          const hasFailed = imageData.uploadStatus === 'failed';
          const photoLabel = `Photo ${index + 1}${imageData.fileName ? `, ${imageData.fileName}` : ''}`;
          const stateLabel = hasFailed ? ', upload failed' : isUploading ? ', uploading' : isDeleting ? ', removing' : '';

          return (
            <View
              key={`${imageId}-${index}`}
              style={[
                styles.imageContainer,
                {
                  width: imageSize,
                  height: imageSize,
                },
                hasFailed && styles.imageContainerError,
              ]}
            >
              {/* Main Image */}
              <Pressable
                style={({ pressed }) => [styles.imageWrapper, pressed && !!onImagePress && styles.imagePressed]}
                onPress={() => onImagePress?.(imageData)}
                disabled={!onImagePress || isDeleting || isUploading}
                accessibilityRole={onImagePress ? 'imagebutton' : 'image'}
                accessibilityLabel={`${photoLabel}${stateLabel}`}
                accessibilityHint={onImagePress ? 'Opens the photo full screen' : undefined}
                accessibilityState={{ busy: isUploading || isDeleting, disabled: !onImagePress || isDeleting || isUploading }}
              >
                <Image
                  source={{ uri: imageData.imageUrl }}
                  style={[
                    styles.image,
                    (isDeleting || isUploading) && styles.imageLoading,
                  ]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                  onLoad={() => {
                    console.log('[ImagePreviewGrid] Image loaded successfully:', imageData.imageUrl);
                  }}
                  onError={(error) => {
                    console.error('[ImagePreviewGrid] Image failed to load:', {
                      url: imageData.imageUrl,
                      error
                    });
                  }}
                />

                {/* Upload Progress Overlay */}
                {showProgress && isUploading && imageData.progress !== undefined && (
                  <View style={styles.progressOverlay}>
                    <View style={styles.progressCircle}>
                      <ActivityIndicator size="small" color={t.overlay.onImage} />
                      <Text style={styles.progressPercentage}>
                        {Math.round(imageData.progress)}%
                      </Text>
                    </View>
                  </View>
                )}

                {/* Delete Loading Overlay */}
                {isDeleting && (
                  <View style={styles.progressOverlay}>
                    <ActivityIndicator size="small" color={t.overlay.onImage} />
                  </View>
                )}

                {/* Error Overlay: icon and word, never colour alone */}
                {hasFailed && (
                  <View style={styles.errorOverlay}>
                    <Icon name="alert-circle" size={iconSize.lg} color={t.overlay.onImage} />
                    <Text style={styles.errorText}>Upload failed</Text>
                  </View>
                )}
              </Pressable>

              {/* Remove Button: 44/48 target with a scrim circle (guide 13.10) */}
              {editable && !isDeleting && (
                <Pressable
                  style={styles.removeButton}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                  accessibilityHint="Removes this photo"
                  testID={`remove-image-${index}`}
                  onPress={() => {
                    if (onRemoveImage || imageData.id) {
                      handleRemoveImage(imageData);
                    } else {
                      handleRemove(index);
                    }
                  }}
                >
                  {({ pressed }) => (
                    <View style={[styles.removeCircle, pressed && styles.removeCirclePressed]}>
                      <Icon name="close" size={iconSize.sm} color={t.overlay.onImage} />
                    </View>
                  )}
                </Pressable>
              )}

              {/* Metadata */}
              {showMetadata && (
                <View style={styles.metadataContainer}>
                  <Text style={styles.metadataText} numberOfLines={1}>
                    {imageData.fileName}
                  </Text>
                  {imageData.fileSize && imageData.fileSize > 0 && (
                    <Text style={styles.metadataSize}>
                      {formatFileSize(imageData.fileSize)}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Free slot hint if not at max capacity (decorative) */}
        {editable && effectiveImages.length < maxImages && (
          <View
            style={[
              styles.placeholder,
              {
                width: imageSize,
                height: imageSize,
              },
            ]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Icon name="plus" size={iconSize.lg} color={t.icon.secondary} />
          </View>
        )}
      </View>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginVertical: space.sm,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: GRID_GAP,
  },
  imageContainer: {
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.cardActive,
    position: 'relative' as const,
  },
  imageContainerError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  imageWrapper: {
    width: '100%' as const,
    height: '100%' as const,
    position: 'relative' as const,
  },
  imagePressed: {
    opacity: 0.85,
  },
  image: {
    width: '100%' as const,
    height: '100%' as const,
  },
  imageLoading: {
    opacity: 0.6,
  },
  progressOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  progressCircle: {
    alignItems: 'center' as const,
    gap: space.xs,
  },
  progressPercentage: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
    color: t.overlay.onImage,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    padding: space.xs,
  },
  errorText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.overlay.onImage,
    textAlign: 'center' as const,
  },
  removeButton: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    width: touchTarget,
    height: touchTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    zIndex: 10,
    elevation: 11,
  },
  removeCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  removeCirclePressed: {
    backgroundColor: t.overlay.imageBackdrop,
  },
  metadataContainer: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: t.overlay.scrim,
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
  },
  metadataText: {
    ...typography.caption2,
    fontWeight: fontWeight.medium,
    color: t.overlay.onImage,
  },
  metadataSize: {
    ...typography.caption2,
    fontVariant: ['tabular-nums' as const],
    color: t.overlay.onImage,
  },
  placeholder: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: t.border.field,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
});
