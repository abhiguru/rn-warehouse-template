import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { deleteGRNImage } from '../services/imageUploadService';
import { getSupabaseClient } from '@/config/supabaseConfig';

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
  columns = 4,
  showMetadata = false,
  showProgress = true,
}) => {
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());

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

  const imageSize = (screenWidth - 32 - (columns - 1) * 8) / columns;

  const handleRemove = (index: number) => {
    if (!editable || !onRemove) return;

    Alert.alert(
      'Remove Image',
      'Are you sure you want to remove this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
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

    Alert.alert(
      'Remove Image',
      'Are you sure you want to remove this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
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
              Alert.alert(
                'Delete Failed',
                error instanceof Error ? error.message : 'Failed to delete image'
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
      <View style={styles.grid}>
        {effectiveImages.map((imageData, index) => {
          const imageId = imageData.id || imageData.imageUrl;
          const isDeleting = deletingImages.has(imageId);
          const isUploading = imageData.uploadStatus === 'uploading';
          const hasFailed = imageData.uploadStatus === 'failed';

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
              <TouchableOpacity
                style={styles.imageWrapper}
                onPress={() => onImagePress?.(imageData)}
                activeOpacity={onImagePress ? 0.7 : 1}
                disabled={isDeleting || isUploading}
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
                      <ActivityIndicator size="small" color={theme.colors.white} />
                      <Text style={styles.progressPercentage}>
                        {Math.round(imageData.progress)}%
                      </Text>
                    </View>
                  </View>
                )}

                {/* Delete Loading Overlay */}
                {isDeleting && (
                  <View style={styles.progressOverlay}>
                    <ActivityIndicator size="small" color={theme.colors.white} />
                  </View>
                )}

                {/* Error Overlay */}
                {hasFailed && (
                  <View style={styles.errorOverlay}>
                    <Icon name="alert-circle" size={32} color={theme.colors.white} />
                    <Text style={styles.errorText}>Failed</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Remove Button */}
              {editable && !isDeleting && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => {
                    if (onRemoveImage || imageData.id) {
                      handleRemoveImage(imageData);
                    } else {
                      handleRemove(index);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Icon name="close" size={16} color={theme.colors.white} />
                </TouchableOpacity>
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

        {/* Add placeholder if not at max capacity */}
        {editable && effectiveImages.length < maxImages && (
          <View
            style={[
              styles.placeholder,
              {
                width: imageSize,
                height: imageSize,
              },
            ]}
          >
            <Text style={styles.placeholderText}>+</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageContainer: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.gray[100],
    position: 'relative',
  },
  imageContainerError: {
    borderWidth: 2,
    borderColor: theme.colors.semantic.error,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageLoading: {
    opacity: 0.6,
  },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircle: {
    alignItems: 'center',
    gap: 4,
  },
  progressPercentage: {
    color: theme.colors.white,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(220, 38, 38, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  metadataContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 4,
  },
  metadataText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: theme.fontWeight.medium,
  },
  metadataSize: {
    color: theme.colors.gray[300],
    fontSize: 9,
  },
  placeholder: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.gray[300],
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: theme.fontSize['2xl'],
    color: theme.colors.gray[400],
  },
});