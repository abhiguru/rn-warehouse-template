/**
 * Enrollment review (admins): approve a verified phone with customer access,
 * or reject it. Style guide §14.8 step 4 and §13.6 object cells.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import {
  EnrollmentCustomer,
  PendingEnrollment,
  listEnrollmentCustomers,
  listPendingEnrollments,
  reviewEnrollment,
} from '@/services/enrollmentReviewService';

import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { t as tr } from '@/i18n';

export default function EnrollmentReviewScreen() {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<PendingEnrollment[]>([]);
  const [customers, setCustomers] = useState<EnrollmentCustomer[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (role !== 'admin') return;
    setBusy(true);
    setError(null);
    try {
      const [enrollments, available] = await Promise.all([
        listPendingEnrollments(), listEnrollmentCustomers(),
      ]);
      setPending(enrollments);
      setCustomers(available);
      setSelectedUser(current => {
        if (current && enrollments.some(item => item.id === current)) return current;
        setSelectedCustomers([]);
        return null;
      });
    } catch {
      setError(tr('auth.review.couldNotLoad'));
    } finally { setBusy(false); }
  }, [role]);

  useEffect(() => {
    if (role === 'admin') void refresh();
  }, [role, refresh]);

  const decide = (decision: 'approved' | 'rejected') => {
    const profile = pending.find(item => item.id === selectedUser);
    if (!profile) return;
    if (decision === 'approved' && selectedCustomers.length === 0) {
      showAlert(tr('auth.review.chooseCustomerTitle'), tr('auth.review.chooseCustomerMessage'));
      return;
    }
    const name = profile.display_name || profile.name;
    showAlert(
      tr(decision === 'approved' ? 'auth.review.approveTitle' : 'auth.review.rejectTitle', { name }),
      decision === 'approved'
        ? tr('auth.review.approveMessage', { name, count: selectedCustomers.length })
        : tr('auth.review.rejectMessage', { name }),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr(decision === 'approved' ? 'auth.review.approveAction' : 'auth.review.rejectAction'), style: decision === 'rejected' ? 'destructive' : 'default', onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await reviewEnrollment(profile.id, decision, selectedCustomers);
              setSelectedUser(null);
              setSelectedCustomers([]);
              const [enrollments, available] = await Promise.all([listPendingEnrollments(), listEnrollmentCustomers()]);
              setPending(enrollments);
              setCustomers(available);
            } catch {
              showAlert(tr('auth.review.couldNotSaveTitle'), tr('common.checkConnection'));
            } finally { setBusy(false); }
          })();
        } },
      ]
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + space.xxl }]}
    >
      <Stack.Screen options={{ title: tr('auth.review.screenTitle'), headerShown: true }} />
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <Text style={styles.title} accessibilityRole="header">{tr('auth.review.heading')}</Text>
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
          <Text style={styles.subtitle}>{tr('auth.review.emptyMessage')}</Text>
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
            onPress={() => { setSelectedUser(profile.id); setSelectedCustomers([]); }}
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
      {selectedUser && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader} accessibilityRole="header">{tr('auth.review.assignHeader')}</Text>
          {customers.length === 0 && <Text style={styles.subtitle}>{tr('auth.review.noCustomers')}</Text>}
          {customers.map(customer => {
            const checked = selectedCustomers.includes(customer.id);
            return (
              <Pressable
                key={customer.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={customer.name}
                onPress={() => setSelectedCustomers(ids => checked ? ids.filter(id => id !== customer.id) : [...ids, customer.id])}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed, checked && styles.rowSelected]}
              >
                <Icon
                  name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={iconSize.lg}
                  color={checked ? t.brand.fill : t.border.field}
                />
                <Text style={[styles.rowText, styles.customerName]}>{customer.name}</Text>
              </Pressable>
            );
          })}
          <Button size="fullWidth" onPress={() => decide('approved')} disabled={busy}>{tr('auth.review.approveWithAssignment')}</Button>
          <Button size="fullWidth" type="secondary" variant="negative" onPress={() => decide('rejected')} disabled={busy}>{tr('auth.review.rejectAction')}</Button>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
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
  title: { ...typography.title2, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  section: { gap: space.md, marginTop: space.md },
  sectionHeader: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    color: t.text.secondary,
  },
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
  rowPressed: { backgroundColor: t.surface.cardPressed },
  rowSelected: { backgroundColor: t.surface.selected, borderColor: t.brand.tint, borderWidth: 2 },
  rowText: { flex: 1 },
  name: { ...typography.headline, color: t.text.primary },
  meta: { ...typography.subhead, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
  customerName: { ...typography.body, color: t.text.primary },
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
});
