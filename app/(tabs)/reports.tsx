/**
 * Reports tab: the hub every report is opened from.
 *
 * Sections, in order (src/components/reports/reportHubSections.ts): the reports this
 * account pinned, up to three it opened last, then every report it may open by category
 * (Stock, Movement, Financial, Operations). Each row has a star that pins the report;
 * pins and recent reports are kept per facility and account (useReportPrefs).
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { triggerLightTap } from '@/hooks/useHaptics';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import type { ReportDefinition } from '@/features/reports/reportRegistry';
import { useReportPrefs } from '@/features/reports/useReportPrefs';
import { useFacilityName } from '@/features/reports/useFacilityName';
import { ReportHubRow } from '@/components/reports/ReportHubRow';
import { reportHubSections, type ReportHubSectionId } from '@/components/reports/reportHubSections';
import { SectionHeader } from '@/components/ui';
import { t as translate } from '@/i18n';
import { isWarehouseUser } from '@/config/roles';
import type { ScrollViewRef } from '@/types/nativeRefs';

/** A second tap on a report within this long of the first is a double tap, and is ignored. */
const REPORT_PUSH_GUARD_MS = 600;

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background.base,
    },
    header: {
      paddingHorizontal: layout.marginCompact,
      paddingTop: space.md,
      paddingBottom: space.lg,
      backgroundColor: t.surface.header,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: space.md,
    },
    headerTitleContainer: {
      flex: 1,
    },
    headerTitle: {
      // Top-level tab title (guide §13.8): large title on every tab.
      ...typography.largeTitle,
      color: t.text.primary,
    },
    headerSubtitle: {
      ...typography.subhead,
      color: t.text.secondary,
      marginTop: space.xs,
    },
    // The facility the reports are of, under the title (SR-O11).
    headerFacility: {
      ...typography.footnote,
      color: t.text.secondary,
      marginTop: space.xxs,
    },
    profileButton: {
      width: touchTarget,
      height: touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    profileButtonPressed: {
      backgroundColor: t.brand.subtle,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: space.huge,
    },
    // SectionHeader brings its own 16 side padding, 24 above and 8 below.
    sectionContent: {
      gap: space.sm,
      paddingHorizontal: layout.marginCompact,
    },
  });

/** A section's title, in the app's language at the time it is drawn. */
function sectionTitle(id: ReportHubSectionId): string {
  switch (id) {
    case 'pinned':
      return translate('reports.hub.pinned');
    case 'recent':
      return translate('reports.hub.recent');
    case 'stock':
      return translate('common.stock');
    case 'movement':
      return translate('reports.hub.movement');
    case 'financial':
      return translate('reports.hub.financial');
    case 'operations':
      return translate('reports.hub.operations');
  }
}

export default function ReportsScreen() {
  const router = useRouter();
  const { userProfile } = useAppSelector((state) => state.auth);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const { prefs, togglePin, noteOpened } = useReportPrefs();
  const facility = useFacilityName();

  const role = userProfile?.role;
  // Staff see every customer's reports, like the managers.
  const seesAllCustomers = isWarehouseUser(role);
  // Every id, from the registry and from what was stored, passes the role's gate here.
  const sections = reportHubSections(role, prefs.pinned, prefs.recent);

  // A section that appears or changes at the top (Recent after the first report opened, Pinned
  // after the first pin) would be out of sight on a tab scrolled down: go back to the top. Only a
  // change in the number of sections or the first one's id counts, not a draw or a re-focus.
  const scrollRef = useRef<ScrollViewRef>(null);
  const shownSections = useRef<string | null>(null);
  const sectionsKey = `${sections.length}:${sections[0]?.id ?? ''}`;
  useEffect(() => {
    const before = shownSections.current;
    shownSections.current = sectionsKey;
    if (before !== null && before !== sectionsKey) scrollRef.current?.scrollTo({ y: 0 });
  }, [sectionsKey]);

  // A double tap on a row would push the report twice, and back would then show it again.
  const lastPushAt = useRef(0);
  const openReport = (report: ReportDefinition) => {
    const now = Date.now();
    if (now - lastPushAt.current < REPORT_PUSH_GUARD_MS) return;
    lastPushAt.current = now;
    noteOpened(report.id);
    router.push(report.route as any);
  };
  const toggleReportPin = (report: ReportDefinition) => {
    triggerLightTap();
    togglePin(report.id);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              {translate('nav.reports.title')}
            </Text>
            {facility ? (
              <Text style={styles.headerFacility} accessibilityLabel={translate('reports.shared.facilityLabel', { name: facility })}>
                {facility}
              </Text>
            ) : null}
            <Text style={styles.headerSubtitle}>
              {seesAllCustomers ? translate('nav.reports.subtitleStaff') : translate('nav.reports.subtitleCustomer')}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.profileButton, pressed && styles.profileButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={translate('nav.reports.profileAndSettings')}
          >
            <Icon name="cog-outline" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
        </View>
      </View>

      {/* Report List */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => (
          <View key={section.id} testID={`reports-hub-section-${section.id}`}>
            <SectionHeader title={sectionTitle(section.id)} />
            <View style={styles.sectionContent}>
              {section.reports.map((report) => (
                <ReportHubRow
                  key={report.id}
                  report={report}
                  pinned={prefs.pinned.includes(report.id)}
                  onOpen={() => openReport(report)}
                  onTogglePin={() => toggleReportPin(report)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
