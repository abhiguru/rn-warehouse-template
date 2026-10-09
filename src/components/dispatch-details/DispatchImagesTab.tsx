/**
 * DispatchImagesTab Component - SAP Fiori image grid (docs/STYLE_GUIDE.md §13.10)
 *
 * Features:
 * - 3-column grid with 4 px gaps, square thumbnails
 * - Tap to view full screen
 * - Empty state when no images, with "Add photo" when uploads are allowed
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 3;
const GRID_PADDING = space.sm;
const IMAGE_GAP = space.xs;
const IMAGE_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - IMAGE_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

// Using snake_case to match backend RPC types
export interface DispatchImageData {
  id: string;
  image_url: string;
  file_name?: string;
}

interface DispatchImagesTabProps {
  images: DispatchImageData[];
  onImagePress?: (images: DispatchImageData[], index: number) => void;
  /** Adds a photo to the submitted dispatch; omit to show the tab read-only. */
  onUpload?: () => void;
  isUploading?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
    paddingTop: space.md,
    paddingBottom: space.xs,
    gap: space.sm,
  },
  sectionHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    flex: 1,
  },
  addIconButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
  },
  addIconButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  addIconButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  grid: {
    padding: GRID_PADDING,
  },
  row: {
    gap: IMAGE_GAP,
    marginBottom: IMAGE_GAP,
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.cardActive,
  },
  imageWrapperPressed: {
    opacity: 0.85,
  },
  image: {
    width: '100%' as const,
    height: '100%' as const,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xl,
    backgroundColor: t.background.base,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.sm,
    textAlign: 'center' as const,
  },
  uploadButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    marginTop: space.xl,
    minHeight: touchTarget,
    minWidth: 120,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    backgroundColor: t.brand.fill,
  },
  uploadButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  uploadButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
});

export const DispatchImagesTab: React.FC<DispatchImagesTabProps> = ({
  images,
  onImagePress,
  onUpload,
  isUploading = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  if (images.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="image-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle}>No photos yet</Text>
        <Text style={styles.emptySubtitle}>
          {onUpload ? 'Add a photo of the loaded vehicle or goods.' : 'Photos of this dispatch appear here.'}
        </Text>
        {onUpload && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add dispatch photo"
            accessibilityState={{ disabled: isUploading, busy: isUploading }}
            style={({ pressed }) => [styles.uploadButton, pressed && styles.uploadButtonPressed]}
            onPress={onUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={t.brand.onFill} />
            ) : (
              <Icon name="camera-plus-outline" size={iconSize.md} color={t.brand.onFill} />
            )}
            <Text style={styles.uploadButtonText}>{isUploading ? 'Uploading…' : 'Add photo'}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const renderImage = ({ item, index }: { item: DispatchImageData; index: number }) => (
    <Pressable
      style={({ pressed }) => [styles.imageWrapper, pressed && styles.imageWrapperPressed]}
      onPress={() => onImagePress?.(images, index)}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Dispatch photo ${index + 1} of ${images.length}`}
      accessibilityHint="Opens the photo full screen"
    >
      <Image
        source={{ uri: item.image_url }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
    </Pressable>
  );

  const countLabel = `${images.length} ${images.length === 1 ? 'photo' : 'photos'}`;

  return (
    <View style={styles.container}>
      {/* Section header with count and add action */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionHeaderText} accessibilityRole="header">
          {countLabel}
        </Text>
        {onUpload && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add dispatch photo"
            accessibilityState={{ disabled: isUploading, busy: isUploading }}
            style={({ pressed }) => [styles.addIconButton, pressed && styles.addIconButtonPressed]}
            onPress={onUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={t.brand.tint} />
            ) : (
              <Icon name="camera-plus-outline" size={iconSize.md} color={t.brand.tint} />
            )}
            <Text style={styles.addIconButtonText}>{isUploading ? 'Uploading…' : 'Add photo'}</Text>
          </Pressable>
        )}
      </View>

      {/* Image Grid */}
      <FlatList
        data={images}
        renderItem={renderImage}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.row}
      />
    </View>
  );
};

