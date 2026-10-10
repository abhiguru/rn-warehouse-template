/**
 * GRNImagesTab: the Images tab of the GRN object page (style guide §13.10).
 *
 * Three-column grid of square thumbnails with 4 px gaps, quick filter chips
 * (All, Header, Items), an add action for editors and a remove button on each
 * thumbnail when the grid is editable. Tap a thumbnail to view it full screen.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, FlatList, Dimensions, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatNumber } from '@/utils/formatters';
import { t as tr } from '@/i18n';

const LOG_PREFIX = '[GRNImagesTab]';

const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 3;
const GRID_PADDING = space.sm;
const IMAGE_GAP = space.xs;
const IMAGE_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - IMAGE_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
/** Visible circle of the remove button; its touch area is touchTarget. */
const REMOVE_CIRCLE = 28;

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
  onUpload?: () => void;
  onDeleteImage?: (image: GRNImageData) => void;
  isUploading?: boolean;
}

type FilterType = 'all' | 'header' | 'item';

const fill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },

  // Quick filter chips (style guide §13.5)
  filterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xxs,
    backgroundColor: t.surface.header,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
  },
  filterChipSelected: { backgroundColor: t.brand.subtle, borderColor: t.brand.subtle },
  filterChipPressed: { backgroundColor: t.surface.cardPressed },
  filterText: { ...typography.caption1, color: t.text.primary },
  filterTextSelected: { color: t.brand.tint, fontWeight: fontWeight.semibold },
  addIconButton: {
    marginLeft: 'auto' as const,
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  addIconButtonPressed: { backgroundColor: t.brand.subtle },

  // Grid
  grid: { padding: GRID_PADDING },
  row: { gap: IMAGE_GAP, marginBottom: IMAGE_GAP },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.cardActive,
  },
  imagePressable: { width: '100%' as const, height: '100%' as const },
  image: { width: '100%' as const, height: '100%' as const },
  pressedOverlay: { ...fill, backgroundColor: t.interaction.pressedOverlay },
  placeholder: {
    ...fill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface.cardActive,
  },
  badge: {
    position: 'absolute' as const,
    top: space.xs,
    right: space.xs,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  labelOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: t.overlay.scrim,
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
  },
  labelText: { ...typography.caption2, color: t.overlay.onImage },
  removeButton: {
    position: 'absolute' as const,
    right: 0,
    bottom: 0,
    width: touchTarget,
    height: touchTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  removeCircle: {
    width: REMOVE_CIRCLE,
    height: REMOVE_CIRCLE,
    borderRadius: radius.pill,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  removeCirclePressed: { backgroundColor: t.destructive.fill },

  // Empty state (style guide §13.6)
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxxl,
    gap: space.sm,
    backgroundColor: t.background.base,
  },
  emptyTitle: { ...typography.title3, color: t.text.primary, marginTop: space.sm, textAlign: 'center' as const },
  emptySubtitle: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  uploadButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    marginTop: space.lg,
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    backgroundColor: t.brand.fill,
  },
  uploadButtonPressed: { backgroundColor: t.brand.fillPressed },
  uploadButtonDisabled: { opacity: t.interaction.disabledOpacity },
  uploadButtonText: { ...typography.callout, color: t.brand.onFill },
});

type Styles = ReturnType<typeof makeStyles>;

function imageLabel(item: GRNImageData): string {
  if (item.category === 'header') return tr('grn.images.grnPhoto');
  return item.item_name ? tr('grn.images.photoOfItem', { item: item.item_name }) : tr('grn.images.photoOfUnnamedItem');
}

function deleteImageLabel(item: GRNImageData): string {
  if (item.category === 'header') return tr('grn.images.deleteGrnPhoto');
  return item.item_name
    ? tr('grn.images.deletePhotoOfItem', { item: item.item_name })
    : tr('grn.images.deletePhotoOfUnnamedItem');
}

// Individual image tile with loading and error placeholders
const ImageTile: React.FC<{
  item: GRNImageData;
  onPress: () => void;
  onDelete?: () => void;
  styles: Styles;
  t: ThemeTokens;
}> = ({ item, onPress, onDelete, styles, t }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const label = imageLabel(item);

  return (
    <View style={styles.imageWrapper}>
      <Pressable
        onPress={onPress}
        accessibilityRole="imagebutton"
        accessibilityLabel={label}
        accessibilityHint={tr('grn.images.openHint')}
        style={styles.imagePressable}
      >
        {({ pressed }) => (
          <>
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
                if (__DEV__) console.log(`${LOG_PREFIX} Image loaded:`, item.id);
              }}
              onError={(error) => {
                setIsLoading(false);
                setHasError(true);
                console.error(`${LOG_PREFIX} Image failed to load:`, {
                  id: item.id,
                  url: item.image_url?.substring(0, 100),
                  error,
                });
              }}
            />

            {(isLoading || hasError) && (
              <View style={styles.placeholder}>
                <Icon
                  name={hasError ? 'image-broken-variant' : 'image-outline'}
                  size={iconSize.lg}
                  color={t.icon.secondary}
                />
              </View>
            )}

            <View style={styles.badge}>
              <Icon
                name={item.category === 'header' ? 'file-document-outline' : 'cube-outline'}
                size={iconSize.xs}
                color={t.overlay.onImage}
              />
            </View>
            {item.item_name ? (
              <View style={styles.labelOverlay}>
                <Text style={styles.labelText} numberOfLines={1}>
                  {item.item_name}
                </Text>
              </View>
            ) : null}
            {pressed && <View style={styles.pressedOverlay} />}
          </>
        )}
      </Pressable>
      {onDelete && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteImageLabel(item)}
          style={styles.removeButton}
          onPress={onDelete}
        >
          {({ pressed }) => (
            <View style={[styles.removeCircle, pressed && styles.removeCirclePressed]}>
              <Icon name="trash-can-outline" size={iconSize.sm} color={t.overlay.onImage} />
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
};

export const GRNImagesTab: React.FC<GRNImagesTabProps> = ({
  images,
  onImagePress,
  onUpload,
  onDeleteImage,
  isUploading = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [filter, setFilter] = useState<FilterType>('all');

  const headerCount = useMemo(() => images.filter(img => img.category === 'header').length, [images]);
  const itemCount = useMemo(() => images.filter(img => img.category === 'item').length, [images]);

  const filteredImages = useMemo(() => {
    if (filter === 'all') return images;
    return images.filter(img => img.category === filter);
  }, [images, filter]);

  if (images.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="image-off-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          {tr('grn.images.emptyTitle')}
        </Text>
        <Text style={styles.emptySubtitle}>
          {onUpload
            ? tr('grn.images.emptyCanAdd')
            : tr('grn.images.emptyReadOnly')}
        </Text>
        {onUpload && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isUploading ? tr('grn.images.uploadingLabel') : tr('grn.images.addImage')}
            accessibilityState={{ disabled: isUploading, busy: isUploading }}
            style={({ pressed }) => [
              styles.uploadButton,
              pressed && styles.uploadButtonPressed,
              isUploading && styles.uploadButtonDisabled,
            ]}
            onPress={onUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={t.brand.onFill} />
            ) : (
              <Icon name="image-plus" size={iconSize.md} color={t.brand.onFill} />
            )}
            <Text style={styles.uploadButtonText}>{isUploading ? tr('grn.images.uploading') : tr('grn.images.addImage')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const FilterButton = ({ type, label, count }: { type: FilterType; label: string; count: number }) => {
    const selected = filter === type;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.filterChip,
          pressed && !selected && styles.filterChipPressed,
          selected && styles.filterChipSelected,
        ]}
        onPress={() => setFilter(type)}
        hitSlop={{ top: space.sm, bottom: space.sm }}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatCount(count, 'image')}`}
        accessibilityState={{ selected }}
      >
        {selected && <Icon name="check" size={iconSize.sm} color={t.brand.tint} />}
        <Text style={[styles.filterText, selected && styles.filterTextSelected]} maxFontSizeMultiplier={1.6}>
          {label} ({formatNumber(count)})
        </Text>
      </Pressable>
    );
  };

  const renderImage = ({ item, index }: { item: GRNImageData; index: number }) => (
    <ImageTile
      item={item}
      onPress={() => onImagePress?.(filteredImages, index)}
      onDelete={onDeleteImage ? () => onDeleteImage(item) : undefined}
      styles={styles}
      t={t}
    />
  );

  return (
    <View style={styles.container}>
      {/* Quick filters and add action */}
      <View style={styles.filterRow}>
        <FilterButton type="all" label={tr('common.all')} count={images.length} />
        <FilterButton type="header" label={tr('grn.images.filterHeader')} count={headerCount} />
        <FilterButton type="item" label={tr('common.items')} count={itemCount} />
        {onUpload && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isUploading ? tr('grn.images.uploadingLabel') : tr('grn.images.addImage')}
            accessibilityState={{ disabled: isUploading, busy: isUploading }}
            style={({ pressed }) => [styles.addIconButton, pressed && styles.addIconButtonPressed]}
            onPress={onUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={t.brand.tint} />
            ) : (
              <Icon name="image-plus" size={iconSize.lg} color={t.brand.tint} />
            )}
          </Pressable>
        )}
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
