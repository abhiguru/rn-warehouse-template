/**
 * The state of a screen that only the server can give, with the phone offline (WH-348; Design offline-capture.md 2.5):
 * "This needs a connection. It will load when you reconnect." with no "Try again". Never an error.
 */
import React from 'react';
import { View } from 'react-native';
import { ReportEmptyState } from '@/components/reports/ReportEmptyState';
import { t } from '@/i18n';

export const ScreenNeedsConnection: React.FC<{ testID: string }> = ({ testID }) => (
  <View style={{ flex: 1 }} testID={testID}>
    <ReportEmptyState icon="cloud-off-outline" message={t('components.offlineRead.screenNeedsConnection')} />
  </View>
);
