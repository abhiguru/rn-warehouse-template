/**
 * SectionHeader Component
 *
 * Section title for overview tabs: footnote, capitals, text.secondary
 * (docs/STYLE_GUIDE.md §13.6).
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
      <Text
        style={[overviewStyles.sectionHeaderText, colorStyles.sectionHeaderText]}
        accessibilityRole="header"
        accessibilityLabel={title}
      >
        {title.toUpperCase()}
      </Text>
    </View>
  );
};
