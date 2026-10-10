import React, { useState } from 'react';
import {
  Pressable,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { withNativeHandoff } from '@/config/nativeHandoff';
import { File } from 'expo-file-system';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { CameraModal } from '@/components/CameraModal';
import { FioriLinearProgress } from '@/components/FioriLinearProgress';
import {
  uploadGRNHeaderImage,
  uploadGRNItemImage,
  validateImageFile,
  generateTempGRNId,
  ImageUploadProgress
} from '../services/imageUploadService';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
// Type for custom upload function metadata (supports both camelCase and snake_case)
type CustomUploadMetadata = {
  // camelCase (GRN format)
  fileSize?: number;
  fileName?: string;
  mimeType?: string;
  storagePath?: string;
  // snake_case (dispatch format)
  file_size?: number;
  file_name?: string;
  mime_type?: string;
  storage_path?: string;
  // Common field
  uploadTimestamp: string;
};

// Type for custom upload function (for dispatch or other contexts)
export type CustomUploadFunction = (
  asset: ImagePicker.ImagePickerAsset,
  entityId: string,
  onProgress?: (progress: ImageUploadProgress) => void
) => Promise<{
  success: boolean;
  imageId?: string;
  imageUrl?: string;
  error?: string;
  metadata?: CustomUploadMetadata;
}>;

interface ImageUploadButtonProps {
  // Legacy props for backward compatibility
  onImagesSelected?: (urls: string[]) => void;
  currentImages?: string[];

  // New props for enhanced functionality
  onImageUploadStart?: (tempImageData: GRNImageData) => void;
  onImageUploadProgress?: (imageId: string, progress: ImageUploadProgress) => void;
  onImageUploadComplete?: (imageData: GRNImageData) => void;
  onImageUploadError?: (imageId: string, error: string) => void;

  // Configuration
  grnId?: string; // Required for real uploads (also used as entityId for custom uploads)
  itemId?: string; // Required for item images
  imageType?: 'header' | 'item';
  maxImages?: number;
  loading?: boolean;
  disabled?: boolean;
  buttonText?: string;

  // Display options
  showProgress?: boolean;
  allowMultiple?: boolean;

  // Custom upload function (for dispatch or other contexts)
  // When provided, this function is used instead of the default GRN upload
  customUploadFunction?: CustomUploadFunction;
}

export const ImageUploadButton: React.FC<ImageUploadButtonProps> = ({
  // Legacy props
  onImagesSelected,
  currentImages = [],

  // New props
  onImageUploadStart,
  onImageUploadProgress,
  onImageUploadComplete,
  onImageUploadError,
  grnId,
  itemId,
  imageType = 'header',
  maxImages = 10,
  loading = false,
  disabled = false,
  buttonText = tr('grn.photos.addPhotos'),
  showProgress = true,
  allowMultiple = true,
  customUploadFunction,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [showCameraModal, setShowCameraModal] = useState(false);

  const remainingSlots = maxImages - currentImages.length;
  const effectiveGrnId = grnId || generateTempGRNId(); // Use temp ID if no GRN ID provided

  const requestCameraPermission = async () => {
    // The OS permission prompt backgrounds the app on Android; it is a hand-off, not a departure.
    const { status: cameraStatus } = await withNativeHandoff(() => ImagePicker.requestCameraPermissionsAsync());
    return cameraStatus === 'granted';
  };

  // Note: Media library permissions are NOT requested because:
  // 1. Android 13+ uses Photo Picker which doesn't require permissions
  // 2. Play Store rejects apps requesting READ_MEDIA_IMAGES for one-time access
  // The launchImageLibraryAsync() function works without permissions on modern Android

  const uploadImage = async (asset: ImagePicker.ImagePickerAsset): Promise<void> => {
    // Validate image before upload
    const validation = validateImageFile(asset);
    if (!validation.valid) {
      showAlert(tr('grn.photos.cantUseTitle'), validation.error);
      return;
    }

    // Generate temporary image data for immediate UI feedback
    const tempImageId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tempImageData: GRNImageData = {
      id: tempImageId,
      fileName: asset.fileName || 'image.jpg',
      imageUrl: asset.uri, // Temporary local URI
      uploadStatus: 'uploading',
      uploadProgress: 0,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType || 'image/jpeg',
    };

    // Notify parent component that upload started
    onImageUploadStart?.(tempImageData);
    // Legacy support
    if (onImagesSelected && !onImageUploadStart) {
      onImagesSelected([...currentImages, asset.uri]);
    }

    try {
      // Upload using the appropriate service function
      const progressCallback = (progress: ImageUploadProgress) => {
        setUploadProgress(prev => ({ ...prev, [tempImageId]: progress.percentage }));
        onImageUploadProgress?.(tempImageId, progress);
      };

      // Use custom upload function if provided, otherwise use default GRN upload
      let result;
      if (customUploadFunction) {
        result = await customUploadFunction(asset, effectiveGrnId, progressCallback);
      } else {
        result = imageType === 'header'
          ? await uploadGRNHeaderImage(asset, effectiveGrnId, progressCallback)
          : await uploadGRNItemImage(asset, effectiveGrnId, itemId!, progressCallback);
      }

      if (result.success && result.imageUrl && result.metadata) {
        // Extract metadata - handle both camelCase (GRN) and snake_case (dispatch) formats
        const metadata = result.metadata as any;
        const fileName = metadata.fileName || metadata.file_name;
        const storagePath = metadata.storagePath || metadata.storage_path;
        const fileSize = metadata.fileSize || metadata.file_size;
        const mimeType = metadata.mimeType || metadata.mime_type;

        // Create final image data
        const finalImageData: GRNImageData = {
          id: result.imageId || tempImageId, // Use temp ID if no result ID
          fileName,
          imageUrl: result.imageUrl,
          uploadStatus: 'completed',
          uploadProgress: 100,
          storagePath, // Include storage path if available
          fileSize,
          mimeType,
        };

        // For temporary GRN uploads, ensure we use the temp ID for matching
        if (!result.imageId) {
          // Use the temp ID as the identifier for matching
          finalImageData.id = tempImageId;
        }

        // Notify parent component of successful upload
        onImageUploadComplete?.(finalImageData);

        // Legacy support: update the URLs array
        if (onImagesSelected && !onImageUploadComplete) {
          const updatedUrls = currentImages.map(url =>
            url === asset.uri ? result.imageUrl! : url
          );
          onImagesSelected(updatedUrls);
        }

        console.log('[ImageUploadButton] Upload completed:', {
          imageUrl: result.imageUrl,
          tempId: tempImageId,
          finalId: finalImageData.id,
          hasStoragePath: !!storagePath
        });
      } else {
        throw new Error(result.error || tr('grn.photos.uploadFailed'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tr('grn.photos.uploadFailed');
      console.error('[ImageUploadButton] Upload error:', errorMessage);

      // Notify parent component of upload error
      onImageUploadError?.(tempImageId, errorMessage);

      // Show error to user (the raw cause is logged above, not shown)
      showAlert(tr('grn.photos.uploadFailedTitle'), tr('common.checkConnection'));

      // Legacy support: remove failed upload from URLs
      if (onImagesSelected && !onImageUploadError) {
        const filteredUrls = currentImages.filter(url => url !== asset.uri);
        onImagesSelected(filteredUrls);
      }
    } finally {
      // Clean up progress tracking
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[tempImageId];
        return newProgress;
      });
    }
  };

  const uploadImages = async (assets: ImagePicker.ImagePickerAsset[]): Promise<void> => {
    setIsUploading(true);
    try {
      // P1 Fix: Upload images in parallel with concurrency limit (3 at a time)
      // This is ~3x faster than sequential uploads for multiple images
      const CONCURRENCY_LIMIT = 3;

      // Process in batches for controlled concurrency
      for (let i = 0; i < assets.length; i += CONCURRENCY_LIMIT) {
        const batch = assets.slice(i, i + CONCURRENCY_LIMIT);
        // Upload batch in parallel, wait for all to complete before next batch
        await Promise.all(batch.map(asset => uploadImage(asset)));
      }
    } finally {
      setIsUploading(false);
    }
  };

  const pickImages = async () => {
    if (remainingSlots <= 0) {
      showAlert(tr('grn.photos.limitTitle'), tr('grn.photos.limitMessage', { max: maxImages }));
      return;
    }

    // Note: No permissions needed for image picker on Android 13+
    // The system Photo Picker handles access without app permissions
    try {
      const result = await withNativeHandoff(() =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images' as const,
          allowsMultipleSelection: allowMultiple && remainingSlots > 1,
          quality: 0.8,
          base64: false,
          selectionLimit: allowMultiple ? remainingSlots : 1,
        })
      );

      if (!result.canceled && result.assets.length > 0) {
        await uploadImages(result.assets);
      }
    } catch (error) {
      console.error('[ImageUpload] Error picking images:', error);
      showAlert(tr('grn.photos.openLibraryFailedTitle'), tr('grn.photos.tryAgain'));
    }
  };

  // Open custom camera modal with flash control
  const takePhoto = () => {
    if (remainingSlots <= 0) {
      showAlert(tr('grn.photos.limitTitle'), tr('grn.photos.limitMessage', { max: maxImages }));
      return;
    }
    setShowCameraModal(true);
  };

  // Handle photo captured from CameraModal
  const handleCameraCapture = async (uri: string) => {
    setShowCameraModal(false);
    try {
      // Get the actual file size using the new File API (SDK 54+)
      const file = new File(uri);
      let fileSize: number | undefined;

      try {
        const fileInfo = await file.info();
        fileSize = fileInfo?.size;
      } catch (infoError) {
        console.warn('[ImageUpload] Could not get file size, proceeding anyway:', infoError);
      }

      console.log('[ImageUpload] Camera capture file info:', { uri, fileSize });

      // Create asset object with actual file size
      const asset: ImagePicker.ImagePickerAsset = {
        uri,
        width: 0, // Will be determined by the image manipulator
        height: 0,
        type: 'image',
        fileName: `photo_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        fileSize,
      };
      await uploadImage(asset);
    } catch (error) {
      console.error('[ImageUpload] Error processing captured photo:', error);
      showAlert(tr('grn.photos.captureFailedTitle'), tr('grn.photos.captureFailedMessage'));
    }
  };

  const showImageOptions = () => {
    showAlert(
      tr('grn.photos.addPhotoTitle'),
      tr('grn.photos.addPhotoMessage'),
      [
        { text: tr('grn.photos.takePhoto'), onPress: takePhoto },
        { text: tr('grn.photos.chooseFromLibrary'), onPress: pickImages },
        { text: tr('common.cancel'), style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const isBusy = loading || isUploading;
  const isDisabled = disabled || isBusy || remainingSlots <= 0;
  const hasActiveUploads = Object.keys(uploadProgress).length > 0;
  const averageProgress = hasActiveUploads
    ? Object.values(uploadProgress).reduce((sum, progress) => sum + progress, 0) / Object.values(uploadProgress).length
    : 0;
  const countText = remainingSlots < maxImages
    ? tr('grn.photos.countOfMax', { added: currentImages.length, max: maxImages })
    : '';
  const busyText = showProgress && hasActiveUploads
    ? tr('grn.photos.uploadingPercent', { percent: Math.round(averageProgress) })
    : tr('grn.photos.uploadingShort');

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && !isDisabled && styles.buttonPressed,
          isDisabled && !isBusy && styles.buttonDisabled,
        ]}
        onPress={showImageOptions}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={
          isBusy
            ? busyText
            : countText
              ? tr('grn.photos.buttonLabelWithCount', { label: buttonText, added: currentImages.length, max: maxImages })
              : buttonText
        }
        accessibilityState={{ disabled: isDisabled, busy: isBusy }}
      >
        {isBusy ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.buttonText}>{busyText}</Text>
          </View>
        ) : (
          <>
            <Icon name="camera-outline" size={iconSize.lg} color={t.brand.tint} />
            <Text style={styles.buttonText}>{buttonText}</Text>
            {!!countText && <Text style={styles.countText}>{countText}</Text>}
          </>
        )}
      </Pressable>

      {/* Progress bar for uploads */}
      {showProgress && hasActiveUploads && (
        <View style={styles.progressBarContainer}>
          <FioriLinearProgress
            progress={averageProgress / 100}
            variant="default"
            size="default"
            showPercentage={false}
            accessibilityLabel={tr('grn.photos.progressLabel', { percent: Math.round(averageProgress) })}
          />
        </View>
      )}

      {/* Camera Modal with flash control */}
      <CameraModal
        visible={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handleCameraCapture}
      />
    </View>
  );
};

// ============================================================================
// STYLES: dashed photo tile (docs/STYLE_GUIDE.md 13.3)
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: {
    width: '100%' as const,
  },
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexWrap: 'wrap' as const,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: t.border.field,
    borderRadius: radius.card,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.sm,
    minHeight: Math.max(touchTarget, 56),
  },
  buttonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  buttonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  countText: {
    ...typography.footnote,
    fontWeight: fontWeight.regular,
    fontVariant: ['tabular-nums' as const],
    color: t.text.secondary,
  },
  uploadingContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  progressBarContainer: {
    marginTop: space.sm,
    width: '100%' as const,
  },
});
