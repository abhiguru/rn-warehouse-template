/**
 * Access requests (admins): approve a person as a customer of chosen customers,
 * or as staff or a supervisor, or reject the request. Style guide §14.8 step 4
 * and §13.6 object cells.
 *
 * The route and file keep their old name (enrollment-review); the screen is
 * called "Access requests". The decision bar sits below the scrolling list so
 * Approve and Reject never wait at the end of it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { RadioGroup } from '@/components/ui/RadioButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SearchableBottomSheet } from '@/components/common/SearchableBottomSheet';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import {
  EnrollmentRole,
  PendingEnrollment,
  hasEnrollmentCustomers,
  listPendingEnrollments,
  reviewEnrollment,
} from '@/services/enrollmentReviewService';
import { customerService } from '@/services/customer-service';

import { showAlert } from '@/utils/alert';
import { getAppErrorCode } from '@/utils/appError';
import { formatMobile } from '@/utils/formatters';
import { t as tr, type TranslationKey } from '@/i18n';

type ChosenCustomer = { id: string; name: string };
type CustomerHit = { id: string; name: string; mobile?: string; city?: string };

const APPROVE_LABEL: Record<EnrollmentRole, TranslationKey> = {
  customer: 'auth.review.approveAsCustomer',
  staff: 'auth.review.approveAsStaff',
  supervisor: 'auth.review.approveAsSupervisor',
};
const APPROVE_TITLE: Record<EnrollmentRole, TranslationKey> = {
  customer: 'auth.review.approveTitle',
  staff: 'auth.review.approveTitleStaff',
  supervisor: 'auth.review.approveTitleSupervisor',
};

export default function EnrollmentReviewScreen() {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const isFocused = useIsFocused();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<PendingEnrollment[]>([]);
  // Whether the facility has any active customer: the list itself is not drawn (G-23).
  const [hasCustomers, setHasCustomers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [approveAs, setApproveAs] = useState<EnrollmentRole>('customer');
  const [chosen, setChosen] = useState<ChosenCustomer[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedUser;

  const refresh = useCallback(async () => {
    if (role !== 'admin') return;
    setBusy(true);
    setError(null);
    try {
      // The customer check only picks which Add customer control shows: its failure never hides the requests.
      const [enrollments, any] = await Promise.all([
        listPendingEnrollments(), hasEnrollmentCustomers().catch(() => true),
      ]);
      setPending(enrollments);
      setHasCustomers(any);
      // Worked out here, not inside a state updater: updaters must be pure.
      const current = selectedRef.current;
      if (!current || !enrollments.some(item => item.id === current)) {
        setSelectedUser(null);
        setChosen([]);
        setApproveAs('customer');
      }
    } catch {
      setError(tr('auth.review.couldNotLoad'));
    } finally { setBusy(false); }
  }, [role]);

  // On first showing and each time the screen comes back (after Add customer).
  useEffect(() => {
    if (role === 'admin' && isFocused) void refresh();
  }, [role, isFocused, refresh]);

  const searchCustomers = useCallback(async (query: string): Promise<CustomerHit[]> => {
    if (query.length < 2) return [];
    // A failed search throws: the sheet then says so and offers Try again, instead of "Nothing matches".
    const results = await customerService.searchCustomers(query, 20);
    return results.map(customer => ({ id: customer.id, name: customer.name, mobile: customer.mobile, city: customer.city }));
  }, []);

  const addChosen = useCallback((customer: CustomerHit) => {
    // A customer already chosen is ignored; the sheet closes either way.
    setChosen(list => (list.some(item => item.id === customer.id) ? list : [...list, { id: customer.id, name: customer.name }]));
    setSheetOpen(false);
  }, []);

  const renderHit = useCallback((item: CustomerHit, onSelect: (item: CustomerHit) => void) => {
    const meta = [item.mobile ? formatMobile(item.mobile) : '', item.city].filter(Boolean).join(' · ');
    return (
      <Pressable
        style={({ pressed }) => [styles.hit, pressed && styles.rowPressed]}
        onPress={() => onSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={meta ? `${item.name}, ${meta}` : item.name}
      >
        <View style={styles.rowText}>
          <Text style={styles.name}>{item.name}</Text>
          {!!meta && <Text style={styles.meta}>{meta}</Text>}
        </View>
        <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
      </Pressable>
    );
  }, [styles, t]);

  // A confirmation is open: a second tap that arrives before the dialog is drawn must not queue another.
  const confirmingRef = useRef(false);

  const decide = (decision: 'approved' | 'rejected') => {
    if (confirmingRef.current || busy) return;
    const profile = pending.find(item => item.id === selectedUser);
    if (!profile) return;
    if (decision === 'approved' && approveAs === 'customer' && chosen.length === 0) {
      showAlert(tr('auth.review.chooseCustomerTitle'), tr('auth.review.chooseCustomerMessage'));
      return;
    }
    const name = profile.display_name || profile.name;
    const ids = chosen.map(customer => customer.id);
    confirmingRef.current = true;
    showAlert(
      tr(decision === 'approved' ? APPROVE_TITLE[approveAs] : 'auth.review.rejectTitle', { name }),
      decision === 'approved'
        ? approveAs === 'customer'
          ? tr('auth.review.approveMessage', { name, count: ids.length })
          : tr(approveAs === 'supervisor' ? 'auth.review.approveMessageSupervisor' : 'auth.review.approveMessageWarehouse')
        : tr('auth.review.rejectMessage', { name }),
      [
        { text: tr('common.cancel'), style: 'cancel', onPress: () => { confirmingRef.current = false; } },
        { text: tr(decision === 'approved' ? APPROVE_LABEL[approveAs] : 'auth.review.rejectAction'), style: decision === 'rejected' ? 'destructive' : 'default', onPress: () => {
          void (async () => {
            confirmingRef.current = false;
            setBusy(true);
            try {
              // A rejection carries no customers and no role.
              await reviewEnrollment(profile.id, decision, decision === 'approved' ? ids : [], decision === 'approved' ? approveAs : 'customer');
            } catch (failure) {
              // A refusal says why; anything else is the connection.
              showAlert(
                tr('auth.review.couldNotSaveTitle'),
                getAppErrorCode(failure) === 'REFUSED' && failure instanceof Error ? failure.message : tr('common.checkConnection')
              );
              setBusy(false);
              // The decision may have been saved or handled by someone else: show what is left.
              void refresh();
              return;
            }
            // The decision is saved. A failed reload is its own error and never says "Couldn't save".
            setPending(list => list.filter(item => item.id !== profile.id));
            setSelectedUser(null);
            setChosen([]);
            setApproveAs('customer');
            try {
              const [enrollments, any] = await Promise.all([listPendingEnrollments(), hasEnrollmentCustomers().catch(() => true)]);
              setPending(enrollments);
              setHasCustomers(any);
            } catch {
              setError(tr('auth.review.couldNotLoad'));
            } finally { setBusy(false); }
          })();
        } },
      ],
      { cancelable: true, onDismiss: () => { confirmingRef.current = false; } }
    );
  };

  if (role !== 'admin') {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
        <Icon name="account-lock-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.stateTitle} accessibilityRole="header">{tr('auth.review.adminsOnlyTitle')}</Text>
        <Text style={styles.stateMessage}>{tr('auth.review.adminsOnlyMessage')}</Text>
        <Button onPress={() => router.replace('/settings')}>{tr('auth.review.backToSettings')}</Button>
      </View>
    );
  }

  const person = selectedUser !== null;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: tr('auth.review.screenTitle'),
          headerShown: true,
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingBottom: space.xxl }]}
      >
        <Text style={styles.subtitle}>{tr('auth.review.subtitle')}</Text>
        <Button type="secondary" leftIcon="refresh" onPress={() => void refresh()} disabled={busy}>{tr('auth.review.refresh')}</Button>
        {busy && <ActivityIndicator color={t.brand.tint} accessibilityLabel={tr('auth.review.loading')} />}
        {error && (
          <View style={styles.errorStrip} accessibilityRole="alert">
            <Icon name="alert-circle" size={iconSize.md} color={t.status.negative.text} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {!busy && !error && pending.length === 0 && (
          <View style={styles.empty}>
            <Icon name="account-clock-outline" size={iconSize.xl} color={t.icon.secondary} />
            <Text style={styles.emptyTitle}>{tr('auth.review.emptyTitle')}</Text>
            <Text style={styles.emptyMessage}>{tr('auth.review.emptyMessage')}</Text>
          </View>
        )}
        {pending.map(profile => {
          const selected = selectedUser === profile.id;
          const name = profile.display_name || profile.name;
          return (
            <Pressable
              key={profile.id}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={`${name}, ${formatMobile(profile.mobile)}`}
              onPress={() => { setSelectedUser(profile.id); setChosen([]); setApproveAs('customer'); }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed, selected && styles.rowSelected]}
            >
              <Icon name="account-outline" size={iconSize.lg} color={t.icon.secondary} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={2}>{name}</Text>
                <Text style={styles.meta}>{formatMobile(profile.mobile)}</Text>
              </View>
              {selected && <Icon name="check" size={iconSize.md} color={t.brand.tint} />}
            </Pressable>
          );
        })}
        {person && (
          <View style={styles.section}>
            <RadioGroup
              label={tr('auth.review.roleLabel')}
              selectedValue={approveAs}
              onValueChange={value => setApproveAs(value as EnrollmentRole)}
              options={[
                { value: 'customer', label: tr('auth.review.roleCustomer') },
                { value: 'staff', label: tr('auth.review.roleStaff') },
                { value: 'supervisor', label: tr('auth.review.roleSupervisor') },
              ]}
            />
            {approveAs === 'customer' && (
              <View style={styles.customers}>
                <SectionHeader title={tr('auth.review.assignHeader')} />
                {chosen.length > 0 && (
                  <View style={styles.chips}>
                    {chosen.map(customer => (
                      <Pressable
                        key={customer.id}
                        style={({ pressed }) => [styles.chip, pressed && styles.rowPressed]}
                        onPress={() => setChosen(list => list.filter(item => item.id !== customer.id))}
                        accessibilityRole="button"
                        accessibilityLabel={tr('auth.review.removeCustomer', { name: customer.name })}
                      >
                        <Text style={styles.chipText} numberOfLines={1}>{customer.name}</Text>
                        <Icon name="close" size={iconSize.sm} color={t.icon.secondary} />
                      </Pressable>
                    ))}
                  </View>
                )}
                {hasCustomers ? (
                  <Button type="secondary" leftIcon="plus" onPress={() => setSheetOpen(true)} disabled={busy}>
                    {tr('auth.review.addCustomer')}
                  </Button>
                ) : (
                  <>
                    <Text style={styles.subtitle}>{tr('auth.review.noCustomers')}</Text>
                    <Button type="secondary" leftIcon="plus" onPress={() => router.push('/customer-form')}>
                      {tr('auth.review.addCustomer')}
                    </Button>
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {person && (
        <View style={[styles.decisionBar, { paddingBottom: insets.bottom + space.md }]} testID="decision-bar">
          <Button size="fullWidth" onPress={() => decide('approved')} disabled={busy}>{tr(APPROVE_LABEL[approveAs])}</Button>
          <Button size="fullWidth" type="secondary" variant="negative" onPress={() => decide('rejected')} disabled={busy}>{tr('auth.review.rejectAction')}</Button>
        </View>
      )}

      <SearchableBottomSheet<CustomerHit>
        isVisible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={addChosen}
        title={tr('auth.review.searchTitle')}
        placeholder={tr('customers.search.placeholder')}
        searchFn={searchCustomers}
        searchErrorText={tr('customers.search.failed')}
        renderItem={renderHit}
        keyExtractor={item => item.id}
        emptyInitialText={tr('users.edit.searchEmpty')}
        emptySubText={tr('users.edit.searchHint')}
      />
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  scroll: { flex: 1 },
  container: { padding: layout.marginCompact, gap: space.md, flexGrow: 1 },
  stateScreen: {
    flex: 1,
    backgroundColor: t.background.base,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: layout.marginCompact,
    gap: space.md,
  },
  stateTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  stateMessage: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  section: { gap: space.md, marginTop: space.md },
  customers: { gap: space.md },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    maxWidth: '100%' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
  },
  chipText: { ...typography.subhead, color: t.text.primary, flexShrink: 1 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
    backgroundColor: t.surface.card,
  },
  hit: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    minHeight: layout.rowMinHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  rowPressed: { backgroundColor: t.surface.cardPressed },
  rowSelected: { backgroundColor: t.surface.selected, borderColor: t.brand.tint, borderWidth: 2 },
  rowText: { flex: 1 },
  name: { ...typography.headline, color: t.text.primary },
  meta: { ...typography.subhead, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
  decisionBar: {
    gap: space.sm,
    paddingTop: space.md,
    paddingHorizontal: layout.marginCompact,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  errorStrip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.negative.border,
    backgroundColor: t.status.negative.background,
  },
  errorText: { ...typography.footnote, color: t.status.negative.text, flex: 1 },
  empty: { alignItems: 'center' as const, gap: space.sm, paddingVertical: space.xxl },
  emptyTitle: { ...typography.title3, color: t.text.primary },
  emptyMessage: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
});
