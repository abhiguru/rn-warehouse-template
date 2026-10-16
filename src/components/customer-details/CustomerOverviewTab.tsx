/**
 * Overview tab of the customer page: who the customer is and how to reach them (contact card, Address, Tax details,
 * Contact person) and the way to deactivate or activate them. A section appears only when it has a value.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusTag } from '@/components/ui/StatusTag';
import { ContactCard } from '@/components/common/overview-tab/ContactCard';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import type { Customer } from '@/types/customer.types';
import { layout, space, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { formatMobile } from '@/utils/formatters';

type Row = { label: string; value: string | undefined | null };

interface CustomerOverviewTabProps {
  customer: Customer;
  busy: boolean;
  onToggleActive: () => void;
}

export function CustomerOverviewTab({ customer: shown, busy, onToggleActive }: CustomerOverviewTabProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: tr('customers.form.address'),
      rows: [
        { label: tr('customers.fields.address'), value: shown.address },
        { label: tr('customers.fields.city'), value: shown.city },
        { label: tr('customers.fields.state'), value: shown.state },
        { label: tr('customers.fields.pincode'), value: shown.pincode },
      ],
    },
    {
      title: tr('customers.form.taxDetails'),
      rows: [
        { label: tr('customers.fields.gst'), value: shown.gst },
        { label: tr('customers.fields.pan'), value: shown.pan },
      ],
    },
    {
      title: tr('customers.form.contactPerson'),
      rows: [
        { label: tr('customers.fields.name'), value: shown.contact_name },
        { label: tr('customers.fields.contactMobile'), value: shown.contact_mobile ? formatMobile(shown.contact_mobile) : undefined },
        { label: tr('customers.fields.contactEmail'), value: shown.contact_email },
      ],
    },
  ]
    .map(section => ({ ...section, rows: section.rows.filter(row => !!row.value?.trim()) }))
    .filter(section => section.rows.length > 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {!shown.active && (
        <View style={styles.status}>
          <StatusTag status="neutral" label={tr('customers.list.statusDeactivated')} />
        </View>
      )}
      <ContactCard
        type={tr('common.customer')}
        name={shown.name}
        phone={shown.mobile || undefined}
        email={shown.email || undefined}
        iconName="account-outline"
        iconColor={t.brand.tint}
        iconBgColor={t.brand.subtle}
      />
      {sections.map(section => (
        <View key={section.title}>
          <SectionHeader title={section.title} />
          <View style={styles.cells}>
            {section.rows.map((row, index) => (
              <KeyValueCell
                key={row.label}
                keyLabel={row.label}
                value={row.value as string}
                showDivider={index < section.rows.length - 1}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.footer}>
        <Button
          type="tertiary"
          variant={shown.active ? 'negative' : 'tint'}
          onPress={onToggleActive}
          disabled={busy}
        >
          {tr(shown.active ? 'customers.list.deactivateCustomer' : 'customers.page.activate')}
        </Button>
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  scroll: { flex: 1 },
  status: { paddingHorizontal: layout.marginCompact, paddingTop: space.md, alignItems: 'flex-start' as const },
  cells: { backgroundColor: t.surface.card, paddingHorizontal: layout.marginCompact },
  footer: { paddingHorizontal: layout.marginCompact, paddingTop: space.xl, alignItems: 'flex-start' as const },
});

export default CustomerOverviewTab;
