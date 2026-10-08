/**
 * DispatchImagesTab Component - 100% SAP Fiori Compliant
 *
 * Grid layout for dispatch images in Fiori style
 * Features:
 * - 3-column grid optimized for mobile
 * - Tap to view full screen
 * - Empty state when no images
 * - Dynamic colors for dark mode support
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS (Static values only - colors are dynamic)
// ============================================================================
const FIORI_STATIC = {
  spacing: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  typography: {
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
  },
} as const;

const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 3;
const GRID_PADDING = 8;
const IMAGE_GAP = 4;
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
}

export const DispatchImagesTab: React.FC<DispatchImagesTabProps> = ({
  images,
  onImagePress,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.gray50,
    },
    sectionHeaderText: {
      ...FIORI_STATIC.typography.sectionHeader,
      color: colors.gray600,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: FIORI_STATIC.spacing.lg,
      paddingVertical: FIORI_STATIC.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
      gap: 6,
    },
    headerText: {
      ...FIORI_STATIC.typography.caption,
      color: colors.gray600,
    },
    imageWrapper: {
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: colors.gray200,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: FIORI_STATIC.spacing.xl,
      backgroundColor: colors.gray50,
    },
    emptyTitle: {
      ...FIORI_STATIC.typography.body,
      fontWeight: '600' as const,
      color: colors.gray900,
      marginTop: FIORI_STATIC.spacing.sm,
    },
    emptySubtitle: {
      ...FIORI_STATIC.typography.caption,
      color: colors.gray600,
      marginTop: 4,
    },
  }), [colors]);

  if (images.length === 0) {
    return (
      <View style={dynamicStyles.emptyContainer}>
        <Icon name="image-off-outline" size={48} color={colors.gray500} />
        <Text style={dynamicStyles.emptyTitle}>No Images</Text>
        <Text style={dynamicStyles.emptySubtitle}>No images uploaded for this dispatch</Text>
      </View>
    );
  }

  const renderImage = ({ item, index }: { item: DispatchImageData; index: number }) => (
    <TouchableOpacity
      style={dynamicStyles.imageWrapper}
      onPress={() => onImagePress?.(images, index)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`View image ${index + 1} of ${images.length}`}
    >
      <Image
        source={{ uri: item.image_url }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
    </TouchableOpacity>
  );

  return (
    <View style={dynamicStyles.container}>
      {/* Image Header - Fiori Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={dynamicStyles.sectionHeaderText}>Dispatch Images</Text>
      </View>

      <View style={dynamicStyles.headerRow}>
        <Icon name="image-multiple" size={18} color={colors.gray600} />
        <Text style={dynamicStyles.headerText}>{images.length} image{images.length !== 1 ? 's' : ''}</Text>
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

// Static styles (layout only - colors are in dynamicStyles)
const styles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: FIORI_STATIC.spacing.lg,
    paddingTop: FIORI_STATIC.spacing.md,
    paddingBottom: FIORI_STATIC.spacing.sm,
  },
  grid: {
    padding: FIORI_STATIC.spacing.sm,
  },
  row: {
    gap: IMAGE_GAP,
    marginBottom: IMAGE_GAP,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
