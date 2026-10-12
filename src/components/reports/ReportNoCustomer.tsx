/**
 * ReportNoCustomer: what a report shows a customer account that has no customer
 * linked to it (docs/STYLE_GUIDE.md §13.6, §14.10). Every report says it in the
 * same words; only the title in the header is the report's own.
 */
import React from 'react';
import { View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import type { ThemeTokens } from '@/theme/tokens';
import { ReportEmptyState } from './ReportEmptyState';
import { ReportHeader } from './ReportHeader';

export interface ReportNoCustomerProps {
  /** The report's title, for the header. */
  title: string;
}

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
});

export function ReportNoCustomer({ title }: ReportNoCustomerProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <ReportHeader title={title} />
      <ReportEmptyState icon="account-off-outline" message={tr('reports.shared.noCustomerLinked')} description={tr('reports.shared.noCustomer')} />
    </View>
  );
}

export default ReportNoCustomer;
