import React from 'react';
import { IconButton } from 'react-native-paper';
import { useTokens } from '@/hooks/useTheme';
import { iconSize, space } from '@/theme/tokens';

interface Props {
  onRefresh: () => void;
  refreshing: boolean;
  /**
   * @deprecated The icon is always `brand.tint` (style guide §13.13); kept so
   * existing callers still compile. Ignored.
   */
  color?: string;
  label: string;
}

// The 40 px Paper icon button plus this slop reaches the 44/48 touch target.
const HIT_SLOP = { top: space.xs, bottom: space.xs, left: space.xs, right: space.xs };

// A gesture-independent API fallback, including when an empty list cannot scroll.
export function OrderRefreshAction({ onRefresh, refreshing, label }: Props) {
  const t = useTokens();
  return (
    <IconButton
      icon="refresh"
      size={iconSize.lg}
      iconColor={t.brand.tint}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: refreshing, disabled: refreshing }}
      disabled={refreshing}
      loading={refreshing}
      hitSlop={HIT_SLOP}
      onPress={() => { if (!refreshing) onRefresh(); }}
    />
  );
}
