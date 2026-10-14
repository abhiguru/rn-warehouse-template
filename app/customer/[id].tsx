/**
 * Customer page (object page, style guide §14.2): who the customer is, how to
 * reach them, and the way to Edit or deactivate them. Opened from the
 * Customers list; Edit pushes the one-page form (app/customer-edit/[id].tsx).
 *
 * Loads by the route's id each time the page comes into focus, so a name just
 * edited shows. A section appears only when it has a value.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusTag } from '@/components/ui/StatusTag';
import { ContactCard } from '@/components/common/overview-tab/ContactCard';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { SkeletonBox } from '@/components/skeletons/SkeletonBox';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { customerService } from '@/services/customer-service';
import type { Customer } from '@/types/customer.types';
import { iconSize, layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { serverText } from '@/utils/serverText';

type Row = { label: string; value: string | undefined | null };

export default function CustomerPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isFocused = useIsFocused();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const currentId = useRef(id);
  currentId.current = id;

  useEffect(() => {
    if (!isFocused || !id) return;
    let ignore = false;
    void (async () => {
      let result;
      try {
        result = await customerService.getCustomerById(id);
      } catch {
        result = { success: false } as const;
      }
      // Only the customer on the screen now may fill it.
      if (ignore || currentId.current !== id) return;
      if (result.success && result.data) {
        setCustomer(result.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id, isFocused, attempt]);

  // Another customer's page never shows the last one's details.
  const shown = customer && customer.id === id ? customer : null;

  const setActive = useCallback(
    async (active: boolean) => {
      if (!shown) return;
      setBusy(true);
      try {
        const result = active
          ? await customerService.restoreCustomer(shown.id)
          : await customerService.inactivateCustomer(shown.id);
        if (result.success) {
          setCustomer({ ...shown, active });
        } else {
          showAlert(
            tr(active ? 'customers.list.couldNotActivateTitle' : 'customers.list.couldNotDeactivateTitle'),
            serverText(result.message, tr('customers.list.tryAgainInAMoment')),
            [{ text: tr('common.ok') }]
          );
        }
      } catch {
        showAlert(tr('customers.list.couldNotUpdateTitle'), tr('common.checkConnection'), [{ text: tr('common.ok') }]);
      } finally {
        setBusy(false);
      }
    },
    [shown]
  );

  const onToggleActive = useCallback(() => {
    if (!shown) return;
    if (!shown.active) {
      void setActive(true);
      return;
    }
    showAlert(
      tr('customers.list.deactivateConfirmTitle', { name: shown.name }),
      tr('customers.list.deactivateConfirmMessage'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr('customers.list.deactivateCustomer'), style: 'destructive', onPress: () => void setActive(false) },
      ]
    );
  }, [shown, setActive]);

  const sections: { title: string; rows: Row[] }[] = shown
    ? [
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
        .filter(section => section.rows.length > 0)
    : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navSide} />
        <Text style={styles.navTitle} accessibilityRole={shown ? 'header' : undefined}>
          {shown?.name ?? ''}
        </Text>
        <View style={[styles.navSide, styles.navEnd]}>
          {shown && (
            <Button
              type="tertiary"
              onPress={() => router.push({ pathname: '/customer-edit/[id]', params: { id: shown.id } })}
            >
              {tr('common.edit')}
            </Button>
          )}
        </View>
      </View>

      {!shown && !failed && (
        <View style={styles.state} accessibilityRole="progressbar" accessibilityLabel={tr('customers.form.loadingLabel')}>
          <SkeletonBox width="100%" height={touchTarget * 2} />
          <SkeletonBox width="100%" height={touchTarget} />
          <SkeletonBox width="100%" height={touchTarget} />
        </View>
      )}

      {!shown && failed && (
        <View style={styles.state} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.stateText}>{tr('customers.page.loadFailed')}</Text>
          <Button
            type="secondary"
            leftIcon="refresh"
            onPress={() => {
              setFailed(false);
              setAttempt(count => count + 1);
            }}
          >
            {tr('common.retry')}
          </Button>
        </View>
      )}

      {shown && (
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
      )}
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  root: { flex: 1, backgroundColor: t.background.base },
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
  navSide: { minWidth: 80 },
  navEnd: { alignItems: 'flex-end' as const },
  navTitle: { ...typography.headline, color: t.text.primary, flexShrink: 1, textAlign: 'center' as const },
  scroll: { flex: 1 },
  status: { paddingHorizontal: layout.marginCompact, paddingTop: space.md, alignItems: 'flex-start' as const },
  cells: { backgroundColor: t.surface.card, paddingHorizontal: layout.marginCompact },
  footer: { paddingHorizontal: layout.marginCompact, paddingTop: space.xl, alignItems: 'flex-start' as const },
  state: { flex: 1, padding: layout.marginCompact, gap: space.md, justifyContent: 'center' as const },
  stateText: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
});
