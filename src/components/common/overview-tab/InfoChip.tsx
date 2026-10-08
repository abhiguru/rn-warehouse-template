/**
 * InfoChip Component
 *
 * Reusable info chip/badge for overview tabs
 * Based on SAP Fiori for iOS Badge Style
 */

import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { overviewStyles, useOverviewColors } from './FioriStyles';

interface InfoChipProps {
  icon: string;
  label: string;
  iconColor: string;
}

export const InfoChip: React.FC<InfoChipProps> = ({ icon, label, iconColor }) => {
  const colorStyles = useOverviewColors();

  return (
    <View style={[overviewStyles.infoChip, colorStyles.infoChip]}>
      <Icon name={icon} size={16} color={iconColor} />
      <Text style={[overviewStyles.infoChipText, colorStyles.infoChipText]}>{label}</Text>
    </View>
  );
};
