import React from 'react';
import { IconButton } from 'react-native-paper';

interface Props {
  onRefresh: () => void;
  refreshing: boolean;
  color: string;
  label: string;
}

// A gesture-independent API fallback, including when an empty list cannot scroll.
export function OrderRefreshAction({ onRefresh, refreshing, color, label }: Props) {
  return (
    <IconButton
      icon="refresh"
      size={22}
      iconColor={color}
      accessibilityLabel={label}
      accessibilityState={{ busy: refreshing, disabled: refreshing }}
      disabled={refreshing}
      loading={refreshing}
      onPress={() => { if (!refreshing) onRefresh(); }}
    />
  );
}
