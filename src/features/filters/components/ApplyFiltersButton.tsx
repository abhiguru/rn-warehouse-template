/**
 * The one button that applies a set of filters: "Show 34 items".
 * It shows the result count as soon as it is known, stays usable while the
 * count loads, and announces the count to screen readers.
 */
import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { resultsLabel, type FilterResultCount } from '../useFilterResultCount';

export interface ApplyFiltersButtonProps {
  result: FilterResultCount;
  noun: [string, string];
  onPress: () => void;
  disabled?: boolean;
}

export function ApplyFiltersButton({ result, noun, onPress, disabled }: ApplyFiltersButtonProps) {
  const label = resultsLabel(result, noun);
  // Android reads the live region below; iOS needs an explicit announcement.
  useEffect(() => {
    if (Platform.OS === 'ios' && !result.loading && result.count !== null) {
      AccessibilityInfo.announceForAccessibility(label);
    }
  }, [label, result.loading, result.count]);

  return (
    <View accessibilityLiveRegion="polite">
      <Button type="primary" size="fullWidth" onPress={onPress} disabled={disabled} loading={result.loading && result.count === null} loadingText="Show results">
        {label}
      </Button>
    </View>
  );
}

export default ApplyFiltersButton;
