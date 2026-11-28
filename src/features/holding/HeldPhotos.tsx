/**
 * The photos of a held item, read only (WH-304, Design offline-capture.md 7.3 point 3): a grid of thumbnails of the files the
 * recorder's phone uploaded under `held/<held id>/`. Each link is signed from storage with the manager's own storage read, as the
 * GRN photos are; a photo that cannot be signed is Design's "Photo needs a connection" tile (2.5). Nothing opens from a tile.
 */
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';
import { t as tr } from '@/i18n';
import { useViaCurrentPath } from '@/hooks/useLanStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { queryKeys } from '@/lib/queryClient';
import { iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { loadHeldPhotos, type HeldPhotoView } from './heldPhotoLinks';
import type { HeldItemDetail } from './holdingApi';

const COLUMNS = 3;
const GAP = space.xs;

const makeStyles = (t: ThemeTokens) => ({
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: GAP, paddingHorizontal: layout.marginCompact, paddingVertical: space.sm },
  tile: { borderRadius: radius.card, overflow: 'hidden' as const, backgroundColor: t.surface.cardActive },
  image: { width: '100%' as const, height: '100%' as const },
  frame: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, padding: space.xs },
  frameText: { ...typography.caption2, color: t.text.secondary, textAlign: 'center' as const, marginTop: space.xs },
});

interface TileProps {
  photo: HeldPhotoView;
  index: number;
  total: number;
  size: number;
}

function Tile({ photo, index, total, size }: TileProps) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const uri = useViaCurrentPath(photo.url ?? '');
  const label = photo.role === 'dispatch' ? tr('dispatch.photos.photoOf', { index: index + 1, total }) : photo.role === 'item' ? tr('grn.images.photoOfUnnamedItem') : tr('grn.images.grnPhoto');
  if (photo.missing) {
    return (
      <View
        testID={`held-photo-missing-${photo.clientPhotoId}`}
        style={[styles.tile, { width: size, height: size }]}
        accessible
        accessibilityLabel={`${label}, ${tr('common.photoMissing')}`}
      >
        <View style={styles.frame}>
          <Icon name="image-off-outline" size={iconSize.xl} color={tokens.icon.secondary} importantForAccessibility="no" />
          <Text style={styles.frameText} maxFontSizeMultiplier={1.4}>
            {tr('common.photoMissing')}
          </Text>
        </View>
      </View>
    );
  }
  if (photo.url === null || !uri) {
    return (
      <View
        testID={`held-photo-needs-connection-${photo.clientPhotoId}`}
        style={[styles.tile, { width: size, height: size }]}
        accessible
        accessibilityLabel={`${label}, ${tr('components.offlineRead.photoNeedsConnection')}`}
      >
        <View style={styles.frame}>
          <Icon name="image-off-outline" size={iconSize.xl} color={tokens.icon.secondary} importantForAccessibility="no" />
          <Text style={styles.frameText} maxFontSizeMultiplier={1.4}>
            {tr('components.offlineRead.photoNeedsConnection')}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View testID={`held-photo-${photo.clientPhotoId}`} style={[styles.tile, { width: size, height: size }]} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Image source={{ uri }} style={styles.image} contentFit="cover" />
    </View>
  );
}

interface HeldPhotosProps {
  item: HeldItemDetail;
}

/** The photos of a held item; nothing at all when it has none (or while they load). */
export function HeldPhotos({ item }: HeldPhotosProps) {
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const query = useQuery({ queryKey: [...queryKeys.holding.detail(item.id), 'photos', item], queryFn: () => loadHeldPhotos(item), retry: false });
  const photos = query.data ?? [];
  if (photos.length === 0) return null;
  const size = (width - layout.marginCompact * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  return (
    <View testID="held-item-photos" style={styles.grid}>
      {photos.map((photo, index) => (
        <Tile key={photo.clientPhotoId} photo={photo} index={index} total={photos.length} size={size} />
      ))}
    </View>
  );
}
