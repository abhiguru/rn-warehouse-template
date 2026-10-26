/**
 * A titled group of cells on `surface.card` inside the grouped list of Help (style guide §14.12): the section
 * header, then the rounded card that holds the cells. Help (app/help.tsx) and its Connection section
 * (src/features/connection/ConnectionSection.tsx) both use it.
 */
import React from 'react';
import { View } from 'react-native';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, radius, space, type ThemeTokens } from '@/theme/tokens';

export function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <SectionHeader title={title} style={styles.sectionHeader} />
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  section: {
    marginBottom: space.xxl,
  },
  // SectionHeader brings its own top padding; the section's bottom margin already spaces it.
  sectionHeader: {
    marginHorizontal: layout.marginCompact,
    paddingTop: 0,
  },
  sectionContent: {
    marginHorizontal: layout.marginCompact,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.card,
  },
});

export default HelpSection;
