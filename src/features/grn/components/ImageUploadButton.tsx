import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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

// ============================================================================
// FIORI DESIGN TOKENS
// Based on design/sap-fiori-specs/19-linear-progress-indicator.md
// ============================================================================
const FIORI = {
  colors: {
    primary: '#f69000',
    primaryDark: '#dd8200',
    white: '#FFFFFF',
    gray400: '#9ca3af',
    textPrimary: '#1D2D3E',
  },
  spacing: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  dimensions: {
    buttonHeight: 44,
    buttonRadius: 8,
  },
  typography: {
    button: {
      fontSize: 15,
      fontWeight: '600' as const,
    },
    progress: {
      fontSize: 13,
      fontWeight: '600' as const,
    },
  },
} as const;

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
  buttonText = 'Add Photos',
  showProgress = true,
  allowMultiple = true,
  customUploadFunction,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [showCameraModal, setShowCameraModal] = useState(false);

  const remainingSlots = maxImages - currentImages.length;
  const effectiveGrnId = grnId || generateTempGRNId(); // Use temp ID if no GRN ID provided

  const requestCameraPermission = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
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
      Alert.alert('Invalid Image', validation.error);
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
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error('[ImageUploadButton] Upload error:', errorMessage);

      // Notify parent component of upload error
      onImageUploadError?.(tempImageId, errorMessage);

      // Show error to user
      Alert.alert('Upload Failed', errorMessage);

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
      Alert.alert('Limit Reached', `Maximum ${maxImages} images allowed`);
      return;
    }

    // Note: No permissions needed for image picker on Android 13+
    // The system Photo Picker handles access without app permissions
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as const,
        allowsMultipleSelection: allowMultiple && remainingSlots > 1,
        quality: 0.8,
        base64: false,
        selectionLimit: allowMultiple ? remainingSlots : 1,
      });

      if (!result.canceled && result.assets.length > 0) {
        await uploadImages(result.assets);
      }
    } catch (error) {
      console.error('[ImageUpload] Error picking images:', error);
      Alert.alert('Error', 'Failed to pick images');
    }
  };

  // Open custom camera modal with flash control
  const takePhoto = () => {
    if (remainingSlots <= 0) {
      Alert.alert('Limit Reached', `Maximum ${maxImages} images allowed`);
      return;
    }
    setShowCameraModal(true);
  };

  // Handle photo captured from CameraModal
  const handleCameraCapture = async (uri: string) => {
    setShowCameraModal(false);
    try {
      // Get the actual file size using the new File API (SDK 54+)
      const cleanPath = uri.startsWith('file://') ? uri.slice(7) : uri;
      const file = new File(cleanPath);
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
      Alert.alert('Error', 'Failed to process photo');
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      'Add Image',
      'Choose image source',
      [
        { text: 'Camera', onPress: takePhoto },
        { text: 'Photo Library', onPress: pickImages },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const isDisabled = disabled || loading || isUploading || remainingSlots <= 0;
  const hasActiveUploads = Object.keys(uploadProgress).length > 0;
  const averageProgress = hasActiveUploads
    ? Object.values(uploadProgress).reduce((sum, progress) => sum + progress, 0) / Object.values(uploadProgress).length
    : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isDisabled && styles.buttonDisabled]}
        onPress={showImageOptions}
        disabled={isDisabled}
        activeOpacity={0.7}
      >
        {(loading || isUploading) ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="small" color={FIORI.colors.white} />
            {showProgress && hasActiveUploads && (
              <Text style={styles.progressText}>{Math.round(averageProgress)}%</Text>
            )}
          </View>
        ) : (
          <>
            <Icon name="camera" size={20} color={FIORI.colors.white} style={styles.buttonIcon} />
            <Text style={styles.buttonText}>
              {buttonText} {remainingSlots < maxImages && `(${currentImages.length}/${maxImages})`}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Progress bar for uploads - Fiori Compliant */}
      {showProgress && hasActiveUploads && (
        <View style={styles.progressBarContainer}>
          <FioriLinearProgress
            progress={averageProgress / 100}
            variant="default"
            size="default"
            showPercentage={false}
            accessibilityLabel={`Upload progress: ${Math.round(averageProgress)}%`}
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
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FIORI.colors.primary,
    paddingVertical: FIORI.spacing.md,
    paddingHorizontal: FIORI.spacing.xl,
    borderRadius: FIORI.dimensions.buttonRadius,
    gap: 8,
    minHeight: FIORI.dimensions.buttonHeight,
  },
  buttonDisabled: {
    backgroundColor: FIORI.colors.gray400,
    opacity: 0.6,
  },
  buttonIcon: {
    fontSize: 18,
  },
  buttonText: {
    color: FIORI.colors.white,
    ...FIORI.typography.button,
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    color: FIORI.colors.white,
    ...FIORI.typography.progress,
  },
  progressBarContainer: {
    marginTop: FIORI.spacing.sm,
    width: '100%',
  },
});