/**
 * The one button that applies a set of filters: "Show 34 items".
 * It shows the result count as soon as it is known, stays usable while the
 * count loads, and announces the count to screen readers.
 */
import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { t } from '@/i18n';
import { resultsLabel, type FilterResultCount } from '../useFilterResultCount';

export interface ApplyFiltersButtonProps {
  result: FilterResultCount;
  noun: [string, string];
  onPress: () => void;
  /** Only for something the person has not entered yet (both days of a required period, §14.5). */
  disabled?: boolean;
  /**
   * A value that is wrong (a range the wrong way round): the button stays pressable, and a press says what to fix
   * instead of applying (§10). The field shows the same message.
   */
  blockedMessage?: string;
}

export function ApplyFiltersButton({ result, noun, onPress, disabled, blockedMessage }: ApplyFiltersButtonProps) {
  const label = resultsLabel(result, noun);
  // Android reads the live region below; iOS needs an explicit announcement.
  useEffect(() => {
    if (Platform.OS === 'ios' && !result.loading && result.count !== null) {
      AccessibilityInfo.announceForAccessibility(label);
    }
  }, [label, result.loading, result.count]);

  return (
    <View accessibilityLiveRegion="polite">
      <Button
        type="primary"
        size="fullWidth"
        onPress={blockedMessage ? () => AccessibilityInfo.announceForAccessibility(blockedMessage) : onPress}
        disabled={disabled}
        loading={result.loading && result.count === null}
        loadingText={t('filters.results.showResults')}
      >
        {label}
      </Button>
    </View>
  );
}

export default ApplyFiltersButton;
