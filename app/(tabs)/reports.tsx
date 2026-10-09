/**
 * Reports Tab - Report Hub Screen
 *
 * Main entry point for the reporting system.
 * Displays available reports based on user role.
 */

import React, { useMemo } from 'react';
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
} from '@/theme/tokens';
import type { ReportDefinition } from '@/types/report.types';
import { Avatar } from '@/components/ui/Avatar';

// Define all available reports
const CUSTOMER_REPORTS: ReportDefinition[] = [
  {
    id: 'customer-activity',
    title: 'Customer activity',
    description: 'Consolidated view of all customer operations',
    icon: 'account-group-outline',
    route: '/reports/customer-activity',
    staffOnly: false,
    category: 'operations',
  },
  {
    id: 'stock-summary',
    title: 'Stock summary',
    description: 'View current inventory at a glance',
    icon: 'warehouse',
    route: '/reports/stock-summary',
    staffOnly: false,
    category: 'stock',
  },
  {
    id: 'item-stock-summary',
    title: 'Item stock summary',
    description: 'View all items aggregated across customers',
    icon: 'cube-outline',
    route: '/reports/item-stock-summary',
    staffOnly: false,
    category: 'stock',
  },
  {
    id: 'dispatch-activity',
    title: 'Dispatch activity',
    description: 'Recent dispatches and outbound goods',
    icon: 'truck-delivery-outline',
    route: '/reports/dispatch-activity',
    staffOnly: false,
    category: 'movement',
  },
  {
    id: 'grn-activity',
    title: 'GRN activity',
    description: 'Recent goods received with invoice status',
    icon: 'package-down',
    route: '/reports/grn-activity',
    staffOnly: false,
    category: 'movement',
  },
  {
    id: 'invoice-history',
    title: 'Invoice history',
    description: 'Billing history with payment status',
    icon: 'file-document-outline',
    route: '/reports/invoice-history',
    staffOnly: false,
    category: 'financial',
  },
  {
    id: 'stock-aging',
    title: 'Stock aging',
    description: 'Analyse how long stock has been stored',
    icon: 'calendar-clock',
    route: '/reports/stock-aging',
    staffOnly: false,
    category: 'stock',
  },
];

const STAFF_REPORTS: ReportDefinition[] = [
  {
    id: 'operations-dashboard',
    title: 'Operations dashboard',
    description: 'Daily KPIs and activity overview',
    icon: 'view-dashboard-outline',
    route: '/reports/operations-dashboard',
    staffOnly: true,
    category: 'operations',
  },
];

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
      ...typography.title2,
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
      letterSpacing: 0.5,
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
    accessibilityLabel={`${report.title}. ${report.description}`}
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

  // Determine if user is staff (admin or supervisor)
  const isStaff = useMemo(() => {
    const role = userProfile?.role?.toLowerCase();
    return role === 'admin' || role === 'supervisor';
  }, [userProfile]);

  const handleReportPress = (report: ReportDefinition) => {
    router.push(report.route as any);
  };

  // Group reports by category
  const customerReports = CUSTOMER_REPORTS;
  const staffReports = isStaff ? STAFF_REPORTS : [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              Reports
            </Text>
            <Text style={styles.headerSubtitle}>
              {isStaff ? 'View operations and customer reports' : 'View your inventory reports'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.profileButton, pressed && styles.profileButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Profile and settings"
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
          title="Inventory reports"
          reports={customerReports}
          onReportPress={handleReportPress}
          styles={styles}
          t={t}
        />

        {isStaff && (
          <ReportSection
            title="Operations reports"
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
