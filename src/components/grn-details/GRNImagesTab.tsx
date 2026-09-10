/**
 * GRNImagesTab Component
 *
 * Compact grid layout for all GRN images (header + item images)
 * Features:
 * - Category filters (All, Header, Items)
 * - 3-column grid optimized for mobile
 * - Tap to view full screen
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors, ListColors } from '@/hooks/useListColors';

// Add logging for debugging image load issues
const LOG_PREFIX = '[GRNImagesTab]';

const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 3;
const GRID_PADDING = 8;
const IMAGE_GAP = 4;
const IMAGE_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - IMAGE_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

// Using snake_case to match backend RPC types
export interface GRNImageData {
  id: string;
  image_url: string;
  file_name?: string;
  category: 'header' | 'item';
  item_name?: string;
}

interface GRNImagesTabProps {
  images: GRNImageData[];
  onImagePress?: (images: GRNImageData[], index: number) => void;
}

type FilterType = 'all' | 'header' | 'item';

// Individual image component with loading state
const ImageTile: React.FC<{
  item: GRNImageData;
  index: number;
  onPress: () => void;
  colors: ListColors;
}> = ({ item, index, onPress, colors }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <TouchableOpacity
      style={[styles.imageWrapper, { backgroundColor: colors.gray200 }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: item.image_url }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        onLoadStart={() => {
          setIsLoading(true);
          setHasError(false);
        }}
        onLoad={() => {
          setIsLoading(false);
          if (__DEV__) console.log(`${LOG_PREFIX} ✅ Image loaded:`, item.id);
        }}
        onError={(error) => {
          setIsLoading(false);
          setHasError(true);
          console.error(`${LOG_PREFIX} ❌ Image failed to load:`, {
            id: item.id,
            url: item.image_url?.substring(0, 100),
            error
          });
        }}
      />

      {/* Loading indicator */}
      {isLoading && (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.gray100 }]}>
          <Icon name="image-outline" size={24} color={colors.gray400} />
        </View>
      )}

      {/* Error indicator */}
      {hasError && (
        <View style={[styles.errorOverlay, { backgroundColor: colors.gray200 }]}>
          <Icon name="image-broken-variant" size={24} color={colors.gray500} />
        </View>
      )}

      <View style={styles.badge}>
        <Icon
          name={item.category === 'header' ? 'file-document' : 'package-variant'}
          size={10}
          color="#fff"
        />
      </View>
      {item.item_name && (
        <View style={styles.labelOverlay}>
          <Text style={styles.labelText} numberOfLines={1}>{item.item_name}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

export const GRNImagesTab: React.FC<GRNImagesTabProps> = ({
  images,
  onImagePress,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();
  const [filter, setFilter] = useState<FilterType>('all');

  const headerCount = useMemo(() => images.filter(img => img.category === 'header').length, [images]);
  const itemCount = useMemo(() => images.filter(img => img.category === 'item').length, [images]);

  const filteredImages = useMemo(() => {
    if (filter === 'all') return images;
    return images.filter(img => img.category === filter);
  }, [images, filter]);

  if (images.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.cellBackground }]}>
        <Icon name="image-off-outline" size={48} color={colors.gray400} />
        <Text style={[styles.emptyTitle, { color: colors.gray900 }]}>No Images</Text>
        <Text style={[styles.emptySubtitle, { color: colors.gray500 }]}>No images uploaded for this GRN</Text>
      </View>
    );
  }

  const FilterButton = ({ type, label, count }: { type: FilterType; label: string; count: number }) => (
    <TouchableOpacity
      style={[styles.filterButton, { backgroundColor: colors.gray100 }, filter === type && { backgroundColor: colors.primary }]}
      onPress={() => setFilter(type)}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterText, { color: colors.gray500 }, filter === type && { color: colors.cellBackground }]}>
        {label} ({count})
      </Text>
    </TouchableOpacity>
  );

  const renderImage = ({ item, index }: { item: GRNImageData; index: number }) => {
    return (
      <ImageTile
        item={item}
        index={index}
        onPress={() => onImagePress?.(filteredImages, index)}
        colors={colors}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.cellBackground }]}>
      {/* Filter Row */}
      <View style={[styles.filterRow, { borderBottomColor: colors.gray100 }]}>
        <FilterButton type="all" label="All" count={images.length} />
        <FilterButton type="header" label="Header" count={headerCount} />
        <FilterButton type="item" label="Items" count={itemCount} />
      </View>

      {/* Image Grid */}
      <FlatList
        data={filteredImages}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Filter Row
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: GRID_PADDING,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  filterButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Grid
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
    borderRadius: 6,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  labelText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '500',
  },

  // Loading/Error states
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
});
