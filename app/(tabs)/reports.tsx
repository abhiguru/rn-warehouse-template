/**
 * Reports Tab - Report Hub Screen
 *
 * Main entry point for the reporting system.
 * Displays available reports based on user role.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppSelector } from '@/store/hooks';
import theme from '@/theme';
import { useListColors, type ListColors } from '@/hooks/useListColors';
import type { ReportDefinition } from '@/types/report.types';

// Define all available reports
const CUSTOMER_REPORTS: ReportDefinition[] = [
  {
    id: 'customer-activity',
    title: 'Customer Activity',
    description: 'Consolidated view of all customer operations',
    icon: 'account-group',
    route: '/reports/customer-activity',
    staffOnly: false,
    category: 'operations',
  },
  {
    id: 'stock-summary',
    title: 'Stock Summary',
    description: 'View current inventory at a glance',
    icon: 'package-variant',
    route: '/reports/stock-summary',
    staffOnly: false,
    category: 'stock',
  },
  {
    id: 'item-stock-summary',
    title: 'Item Stock Summary',
    description: 'View all items aggregated across customers',
    icon: 'cube-scan',
    route: '/reports/item-stock-summary',
    staffOnly: false,
    category: 'stock',
  },
  {
    id: 'dispatch-activity',
    title: 'Dispatch Activity',
    description: 'Recent dispatches and outbound goods',
    icon: 'truck-fast',
    route: '/reports/dispatch-activity',
    staffOnly: false,
    category: 'movement',
  },
  {
    id: 'grn-activity',
    title: 'GRN Activity',
    description: 'Recent goods received with invoice status',
    icon: 'file-document-multiple-outline',
    route: '/reports/grn-activity',
    staffOnly: false,
    category: 'movement',
  },
  {
    id: 'invoice-history',
    title: 'Invoice History',
    description: 'Billing history with payment status',
    icon: 'receipt',
    route: '/reports/invoice-history',
    staffOnly: false,
    category: 'financial',
  },
  {
    id: 'stock-aging',
    title: 'Stock Aging',
    description: 'Analyze stock age distribution',
    icon: 'calendar-clock',
    route: '/reports/stock-aging',
    staffOnly: false,
    category: 'stock',
  },
];

const STAFF_REPORTS: ReportDefinition[] = [
  {
    id: 'operations-dashboard',
    title: 'Operations Dashboard',
    description: 'Daily KPIs and activity overview',
    icon: 'view-dashboard',
    route: '/reports/operations-dashboard',
    staffOnly: true,
    category: 'operations',
  },
];

interface ReportCardProps {
  report: ReportDefinition;
  onPress: () => void;
  colors: ListColors;
}

const ReportCard: React.FC<ReportCardProps> = ({
  report,
  onPress,
  colors,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.reportCard,
        {
          backgroundColor: colors.cellBackground,
          borderWidth: 1,
          borderColor: colors.cellDivider,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${report.title}: ${report.description}`}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.reportIconContainer,
          { backgroundColor: colors.primaryLight },
        ]}
      >
        <Icon name={report.icon} size={28} color={colors.primary} />
      </View>
      <View style={styles.reportContent}>
        <Text
          style={[
            styles.reportTitle,
            { color: colors.textPrimary },
          ]}
        >
          {report.title}
        </Text>
        <Text
          style={[
            styles.reportDescription,
            { color: colors.textSecondary },
          ]}
          numberOfLines={2}
        >
          {report.description}
        </Text>
      </View>
      <Icon
        name="chevron-right"
        size={24}
        color={colors.textTertiary}
      />
    </TouchableOpacity>
  );
};

interface ReportSectionProps {
  title: string;
  reports: ReportDefinition[];
  onReportPress: (report: ReportDefinition) => void;
  colors: ListColors;
}

const ReportSection: React.FC<ReportSectionProps> = ({
  title,
  reports,
  onReportPress,
  colors,
}) => {
  if (reports.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.textSecondary },
        ]}
      >
        {title}
      </Text>
      <View style={styles.sectionContent}>
        {reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            onPress={() => onReportPress(report)}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
};

export default function ReportsScreen() {
  const router = useRouter();
  const { userProfile } = useAppSelector((state) => state.auth);
  const colors = useListColors();

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
    <View
      style={[
        styles.container,
        { backgroundColor: colors.gray50 },
      ]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: theme.spacing.md,
            backgroundColor: colors.cellBackground,
            borderBottomColor: colors.cellDivider,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTitleContainer}>
            <Text
              style={[
                styles.headerTitle,
                { color: colors.textPrimary },
              ]}
            >
              Reports
            </Text>
            <Text
              style={[
                styles.headerSubtitle,
                { color: colors.textSecondary },
              ]}
            >
              {isStaff
                ? 'View operations and customer reports'
                : 'View your inventory reports'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.profileButton}
          >
            <View
              style={[styles.profileAvatar, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.profileAvatarText}>
                {(userProfile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
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
          title="Inventory Reports"
          reports={customerReports}
          onReportPress={handleReportPress}
          colors={colors}
        />

        {isStaff && (
          <ReportSection
            title="Operations Reports"
            reports={staffReports}
            onReportPress={handleReportPress}
            colors={colors}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    marginTop: 4,
  },
  profileButton: {
    marginLeft: theme.spacing.md,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.md,
    marginLeft: theme.spacing.xs,
  },
  sectionContent: {
    gap: 12,
  },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    gap: 16,
    ...theme.shadows.sm,
  },
  reportIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportContent: {
    flex: 1,
  },
  reportTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 4,
  },
  reportDescription: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
});
