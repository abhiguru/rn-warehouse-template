/**
 * The template Terms of service and Privacy policy screen (WH-140): reading text
 * (style guide §4, §12). Section titles are headers for screen readers; body text
 * uses typography.body in text.primary on a surface.card column.
 *
 * The words are in src/legal/templateText.ts and are NOT lawyer-reviewed
 * (LEGAL_TEXT_REVIEWED in src/constants/legal.ts).
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { LEGAL_UPDATED, legalParty } from '@/constants/legal';
import { t } from '@/i18n';
import { templatePrivacy, templateTerms } from './templateText';
import { layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export function TemplateLegalScreen({ kind }: { kind: 'terms' | 'privacy' }) {
  const insets = useSafeAreaInsets();
  const tokens = useTokens();
  const styles = useThemedStyles(makeStyles);
  const party = legalParty();
  const notGiven = t('auth.legal.notGivenYet');
  const sections = kind === 'terms' ? templateTerms(party, notGiven) : templatePrivacy(party, notGiven);
  const title = kind === 'terms' ? 'Terms of service' : 'Privacy policy';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navBackButton} />
        <Text style={styles.navTitle} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.navPlaceholder} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + space.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.lastUpdated}>Last updated: {LEGAL_UPDATED}</Text>
          {sections.map(section => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {section.title}
              </Text>
              {section.paragraphs?.map(text => (
                <Text key={text} style={styles.paragraph}>
                  {text}
                </Text>
              ))}
              {section.bullets ? (
                <View style={styles.bulletList}>
                  {section.bullets.map(item => (
                    <View key={item} style={styles.bulletItem} accessible accessibilityLabel={item}>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={styles.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {section.after?.map(text => (
                <Text key={text} style={styles.paragraph}>
                  {text}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  navigationBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  navBackButton: { minWidth: 80 },
  navTitle: { ...typography.headline, color: t.text.primary, textAlign: 'center' as const, flex: 1 },
  navPlaceholder: { minWidth: 80 },
  scrollView: { flex: 1 },
  scrollContent: { padding: layout.marginCompact },
  content: {
    width: '100%' as const,
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center' as const,
    borderRadius: radius.card,
    padding: space.xl,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  lastUpdated: { ...typography.footnote, color: t.text.secondary, marginBottom: space.lg },
  section: { marginTop: space.xxl },
  sectionTitle: { ...typography.title3, color: t.text.primary, marginBottom: space.sm },
  paragraph: { ...typography.body, color: t.text.primary, marginBottom: space.md },
  bulletList: { marginLeft: space.xs, marginBottom: space.md },
  bulletItem: { flexDirection: 'row' as const, marginBottom: space.xs },
  bullet: { ...typography.body, color: t.text.secondary, marginRight: space.sm },
  bulletText: { ...typography.body, color: t.text.primary, flex: 1 },
});
