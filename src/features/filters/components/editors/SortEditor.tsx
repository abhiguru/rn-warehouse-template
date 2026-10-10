/** Sort field and direction. The direction is worded for the chosen field. */
import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { SORT_DIRECTIONS } from '../../filterModel';
import type { SortFieldOption, SortOrder, SortState } from '../../types';
import { ChoiceChips } from '../ChoiceChips';

export interface SortEditorProps {
  options: SortFieldOption[];
  value: SortState;
  onChange: (sort: SortState) => void;
}

const makeStyles = (t: ThemeTokens) => ({
  wrap: { gap: space.md },
  caption: { ...typography.footnote, color: t.text.secondary },
});

export function SortEditor({ options, value, onChange }: SortEditorProps) {
  const styles = useThemedStyles(makeStyles);
  const kind = options.find(option => option.field === value.field)?.kind ?? 'date';
  const directions: { value: SortOrder; label: string }[] = [
    { value: 'desc', label: SORT_DIRECTIONS[kind].desc },
    { value: 'asc', label: SORT_DIRECTIONS[kind].asc },
  ];
  return (
    <View style={styles.wrap}>
      <ChoiceChips
        accessibilityLabel="Sort by"
        options={options.map(option => ({ value: option.field, label: option.label }))}
        value={value.field}
        onChange={field => onChange({ field, order: value.order })}
      />
      <Text style={styles.caption}>Order</Text>
      <ChoiceChips
        accessibilityLabel="Sort order"
        options={directions}
        value={value.order}
        onChange={order => onChange({ field: value.field, order })}
      />
    </View>
  );
}

export default SortEditor;
