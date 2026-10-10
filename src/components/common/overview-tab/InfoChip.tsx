/**
 * InfoChip Component
 *
 * Neutral tag for overview tabs: status.neutral background and text
 * (docs/STYLE_GUIDE.md §13.5).
 */

import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { iconSize } from '@/theme/tokens';
import { useOverviewStyles, useOverviewColors } from './FioriStyles';

interface InfoChipProps {
  icon: string;
  label: string;
  /** Icon colour. Defaults to the neutral tag text colour. */
  iconColor?: string;
}

export const InfoChip: React.FC<InfoChipProps> = ({ icon, label, iconColor }) => {
  const colorStyles = useOverviewColors();
  const overviewStyles = useOverviewStyles();

  return (
    <View style={[overviewStyles.infoChip, colorStyles.infoChip]} accessible accessibilityLabel={label}>
      <Icon name={icon} size={iconSize.sm} color={iconColor ?? colorStyles.iconNeutral} />
      <Text style={[overviewStyles.infoChipText, colorStyles.infoChipText]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </View>
  );
};
