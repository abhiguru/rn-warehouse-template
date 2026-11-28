/**
 * The "Change rack or mark" text button of a lot (WH-302, Design 5.2): in the open part of a lot on GRN details, and under a
 * Find goods row. Its screen-reader label names the lot, so each in a list is told apart (Design 5.4).
 */
import React from 'react';
import { Button } from '@/components/ui/Button';
import { formatIdentifier, t as tr } from '@/i18n';

export interface QuickChangeButtonProps {
  item: string;
  /** The GRN number, an identifier (0-9). */
  grn: string | number | null | undefined;
  onPress: () => void;
  testID: string;
}

export function QuickChangeButton({ item, grn, onPress, testID }: QuickChangeButtonProps) {
  return (
    <Button
      type="tertiary"
      leftIcon="pencil-outline"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tr('offline.quickChange.actionLabel', { item, grn: formatIdentifier(grn) })}
      testID={testID}
    >
      {tr('offline.quickChange.action')}
    </Button>
  );
}
