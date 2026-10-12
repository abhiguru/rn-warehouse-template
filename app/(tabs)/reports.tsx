/**
 * Reports Tab - Report Hub Screen
 *
 * Main entry point for the reporting system.
 * Displays available reports based on user role.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
  trackedText,
} from '@/theme/tokens';
import { REPORTS, type ReportDefinition } from '@/features/reports/reportRegistry';
import { Avatar } from '@/components/ui';
import { t as translate } from '@/i18n';
import { canOpenScreen, isWarehouseUser } from '@/config/roles';

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
      padding: layout.marginCompact,
      paddingBottom: space.huge,
    },
    section: {
      marginBottom: space.xxl,
    },
    sectionTitle: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: trackedText(0.5),
      color: t.text.secondary,
      marginBottom: space.sm,
      marginLeft: space.xs,
    },
    sectionContent: {
      gap: space.sm,
    },
    reportCard: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.objectCellMinHeight,
      borderRadius: radius.card,
      padding: space.lg,
      gap: space.lg,
      backgroundColor: t.surface.card,
      ...t.shadow[2],
    },
    reportCardPressed: {
      backgroundColor: t.surface.cardPressed,
    },
    reportIconContainer: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.card,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.brand.subtle,
    },
    reportContent: {
      flex: 1,
    },
    reportTitle: {
      ...typography.headline,
      color: t.text.primary,
      marginBottom: space.xxs,
    },
    reportDescription: {
      ...typography.subhead,
      color: t.text.secondary,
    },
  });

type Styles = ReturnType<typeof makeStyles>;

interface ReportCardProps {
  report: ReportDefinition;
  onPress: () => void;
  styles: Styles;
  t: ThemeTokens;
}

const ReportCard: React.FC<ReportCardProps> = ({ report, onPress, styles, t }) => (
  <Pressable
    style={({ pressed }) => [styles.reportCard, pressed && styles.reportCardPressed]}
    onPress={onPress}
    accessibilityLabel={translate('nav.reports.cardLabel', { title: report.title, description: report.description })}
    accessibilityRole="button"
  >
    <View style={styles.reportIconContainer}>
      <Icon name={report.icon} size={iconSize.lg} color={t.brand.tint} />
    </View>
    <View style={styles.reportContent}>
      <Text style={styles.reportTitle} numberOfLines={2}>
        {report.title}
      </Text>
      <Text style={styles.reportDescription} numberOfLines={2}>
        {report.description}
      </Text>
    </View>
    <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
  </Pressable>
);

interface ReportSectionProps {
  title: string;
  reports: ReportDefinition[];
  onReportPress: (report: ReportDefinition) => void;
  styles: Styles;
  t: ThemeTokens;
}

const ReportSection: React.FC<ReportSectionProps> = ({ title, reports, onReportPress, styles, t }) => {
  if (reports.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionContent}>
        {reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            onPress={() => onReportPress(report)}
            styles={styles}
            t={t}
          />
        ))}
      </View>
    </View>
  );
};

export default function ReportsScreen() {
  const router = useRouter();
  const { userProfile } = useAppSelector((state) => state.auth);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // The operations dashboard is for administrators and supervisors (the server refuses it
  // to staff); every other report is offered to all roles. The gate of each report is in
  // the registry (src/features/reports/reportRegistry.ts).
  const role = userProfile?.role;
  // Staff see every customer's reports, like the managers.
  const seesAllCustomers = isWarehouseUser(role);

  const handleReportPress = (report: ReportDefinition) => {
    router.push(report.route as any);
  };

  // Reports for every role, then the ones this role's gate lets it open
  const customerReports = REPORTS.filter((report) => !report.gate);
  const staffReports = REPORTS.filter((report) => report.gate && canOpenScreen(role, report.gate));
  const showOperations = staffReports.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              {translate('nav.reports.title')}
            </Text>
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
            <Avatar name={userProfile?.name} id={userProfile?.id} size="sm" />
          </Pressable>
        </View>
      </View>

      {/* Report List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ReportSection
          title={translate('nav.reports.inventorySection')}
          reports={customerReports}
          onReportPress={handleReportPress}
          styles={styles}
          t={t}
        />

        {showOperations && (
          <ReportSection
            title={translate('nav.reports.operationsSection')}
            reports={staffReports}
            onReportPress={handleReportPress}
            styles={styles}
            t={t}
          />
        )}
      </ScrollView>
    </View>
  );
}
