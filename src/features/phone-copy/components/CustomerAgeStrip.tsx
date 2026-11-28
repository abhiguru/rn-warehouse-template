/**
 * The "last updated" strip of a customer account (WH-306; product/design/offline-capture.md 9.2, 9.3, 9.7): under the header,
 * outside any list, above everything else. Current and today are `info` strips with their own icons, an earlier day the
 * `warning` strip. The time is in weight 600. Nothing for a warehouse role.
 */
import React from 'react';
import { Text } from 'react-native';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { fontWeight } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { formatLoadedAt } from '@/utils/formatters';
import type { IconName } from '@/types/icon.types';
import { useCustomerAge } from '../useCustomerAge';
import type { CustomerAge } from '../customerAge';

const ICON: Record<CustomerAge, IconName> = {
  current: 'check-circle-outline',
  today: 'clock-outline',
  earlier: 'clock-alert-outline',
};

export function CustomerAgeStrip() {
  const view = useCustomerAge();
  if (!view) return null;
  const when = formatLoadedAt(view.asOf);
  const message = tr(`offline.customerAge.${view.age}`, { time: when, dateTime: when });
  const at = message.indexOf(when);
  const content =
    at < 0 ? (
      <Text testID={`customer-age-${view.age}`}>{message}</Text>
    ) : (
      <Text testID={`customer-age-${view.age}`}>
        {message.slice(0, at)}
        <Text testID="customer-age-time" style={{ fontWeight: fontWeight.semibold }}>{when}</Text>
        {message.slice(at + when.length)}
      </Text>
    );
  return (
    <InlineValidation
      testID="customer-age-strip"
      variant={view.age === 'earlier' ? 'warning' : 'info'}
      icon={ICON[view.age]}
      message={message}
      content={content}
      large
      announce
    />
  );
}

export default CustomerAgeStrip;
