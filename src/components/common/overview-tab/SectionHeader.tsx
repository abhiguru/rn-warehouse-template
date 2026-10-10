/**
 * SectionHeader Component
 *
 * Section title for overview tabs: footnote, capitals, text.secondary
 * (docs/STYLE_GUIDE.md §13.6).
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, trackedText, typography } from '@/theme/tokens';
import { overviewStyles, useOverviewColors } from './FioriStyles';

// `overviewStyles` is built when the file is loaded, so its text keeps the Latin
// metrics. The header's type is built here, per language: Gujarati gets its taller
// line and no letter spacing (spacing pulls conjuncts apart).
const makeStyles = () => ({
  text: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: trackedText(0.5),
  },
});

interface SectionHeaderProps {
  title: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title }) => {
  const colorStyles = useOverviewColors();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={overviewStyles.sectionHeader}>
      <Text
        style={[overviewStyles.sectionHeaderText, styles.text, colorStyles.sectionHeaderText]}
        accessibilityRole="header"
        accessibilityLabel={title}
      >
        {title.toUpperCase()}
      </Text>
    </View>
  );
};
