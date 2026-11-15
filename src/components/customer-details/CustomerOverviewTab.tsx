/**
 * Overview tab of the customer page: who the customer is and how to reach them (contact card, contact person card, Address,
 * Tax details) and the way to deactivate or activate them. A section appears only when it has a value.
 */
import React from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ContactCard } from '@/components/common/overview-tab/ContactCard';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import type { Customer } from '@/types/customer.types';
import { layout, space, type ThemeTokens } from '@/theme/tokens';
import { stateDisplayName } from '@/features/gst/indianStates';
import { t as tr } from '@/i18n';

type Row = { label: string; value: string | undefined | null; layout?: 'inline' | 'stacked' };

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
        { label: tr('customers.fields.address'), value: shown.address, layout: 'stacked' as const },
        { label: tr('customers.fields.city'), value: shown.city },
        { label: tr('customers.fields.state'), value: shown.state ? stateDisplayName(shown.state) : shown.state },
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
  ]
    .map(section => ({ ...section, rows: section.rows.filter(row => !!row.value?.trim()) }))
    .filter(section => section.rows.length > 0);

  const hasContactPerson = [shown.contact_name, shown.contact_mobile, shown.contact_email].some(value => !!value?.trim());

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 0) + space.xxl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.contact}>
        <ContactCard
          type={tr('common.customer')}
          name={shown.name}
          phone={shown.mobile || undefined}
          email={shown.email || undefined}
          iconName="account-outline"
          iconColor={t.brand.tint}
          iconBgColor={t.brand.subtle}
          avatarId={shown.id}
        />
      </View>
      {hasContactPerson ? (
        <View style={styles.contactPerson}>
          <ContactCard
            type={tr('customers.form.contactPerson')}
            name={shown.contact_name?.trim() || undefined}
            phone={shown.contact_mobile || undefined}
            email={shown.contact_email || undefined}
            iconName="account-outline"
            iconColor={t.brand.tint}
            iconBgColor={t.brand.subtle}
          />
        </View>
      ) : null}
      {sections.map(section => (
        <View key={section.title}>
          <SectionHeader title={section.title} />
          <View style={styles.cells}>
            {section.rows.map((row, index) => (
              <KeyValueCell
                key={row.label}
                keyLabel={row.label}
                value={row.value as string}
                layout={row.layout}
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
          loading={busy}
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
  contactPerson: { paddingHorizontal: layout.marginCompact, paddingTop: space.sm },
  contact: { paddingHorizontal: layout.marginCompact, paddingTop: space.md },
  cells: { backgroundColor: t.surface.card },
  footer: { paddingHorizontal: layout.marginCompact, paddingTop: space.xl, alignItems: 'flex-start' as const },
});

export default CustomerOverviewTab;
