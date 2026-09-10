/**
 * SectionHeader Component
 *
 * Reusable section header for overview tabs
 * Based on SAP Fiori for iOS Design Guidelines
 */

import React from 'react';
import { View, Text } from 'react-native';
import { overviewStyles, useOverviewColors } from './FioriStyles';

interface SectionHeaderProps {
  title: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title }) => {
  const colorStyles = useOverviewColors();

  return (
    <View style={overviewStyles.sectionHeader}>
      <Text style={[overviewStyles.sectionHeaderText, colorStyles.sectionHeaderText]}>
        {title.toUpperCase()}
      </Text>
    </View>
  );
};
