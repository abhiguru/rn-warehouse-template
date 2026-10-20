/**
 * Access requests (admins): approve a person as a customer of chosen customers,
 * or as staff or a supervisor, or reject the request. Style guide §14.8 step 4
 * and §13.6 object cells.
 *
 * The route and file keep their old name (enrollment-review); the screen is
 * called "Access requests". The decision bar sits below the scrolling list so
 * Approve and Reject never wait at the end of it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  newestOwnCustomer,
  reviewEnrollment,
} from '@/services/enrollmentReviewService';
import { customerService } from '@/services/customer-service';

import { showAlert } from '@/utils/alert';
import { getAppErrorCode } from '@/utils/appError';
import { formatDate, formatMobile, nationalMobileDigits } from '@/utils/formatters';
import { transportText } from '@/utils/serverText';
import { showToast } from '@/utils/toast';
import { publishUserListChange } from '@/utils/userListSync';
import { t as tr, type TranslationKey } from '@/i18n';

type ChosenCustomer = { id: string; name: string };
type Suggestion = { forUser: string; customer: ChosenCustomer };
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
  // True until the first read ends, so "No access requests" does not show before the list is known.
  const [busy, setBusy] = useState(true);
  // The customer whose mobile is the selected person's mobile, offered with one tap.
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  // Add customer round trip: the text searched before leaving, searched again when the picker re-opens.
  const [reopenQuery, setReopenQuery] = useState<string | null>(null);
  const lastQueryRef = useRef('');
  const suggestionForRef = useRef<string | null>(null);
  const addFlowRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const cardYRef = useRef(0);
  const revealPendingRef = useRef(false);
  const roleLabelRef = useRef<Text>(null);
  const profileId = useAppSelector(state => state.auth.userProfile?.id);
  // The administrator's newest customer as read before Add customer (undefined: could not be read).
  const beforeAddRef = useRef<Promise<{ id: string; name: string } | null | undefined> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedUser;

  const refresh = useCallback(async (): Promise<{ list: PendingEnrollment[]; any: boolean } | null> => {
    if (role !== 'admin') return null;
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
      return { list: enrollments, any };
    } catch (failure) {
      setError(transportText(failure) ?? tr('auth.review.couldNotLoad'));
      return null;
    } finally { setBusy(false); }
  }, [role]);

  // On first showing and each time the screen comes back (after Add customer).
  // Coming back from Add customer, the picker opens again on what was searched, so the new customer is one tap away.
  useEffect(() => {
    if (role !== 'admin' || !isFocused) return;
    void (async () => {
      const result = await refresh();
      if (!addFlowRef.current) return;
      addFlowRef.current = false;
      const before = beforeAddRef.current;
      beforeAddRef.current = null;
      const selectedNow = selectedRef.current;
      // Nobody selected any more (or the list did not load): nothing to come back to.
      if (!result || !selectedNow || !result.list.some(item => item.id === selectedNow)) return;
      // A customer was just made: choose it, no search needed.
      if (profileId && before) {
        const [beforeRow, afterRow] = await Promise.all([before, newestOwnCustomer(profileId).catch(() => undefined)]);
        if (beforeRow !== undefined && afterRow && afterRow.id !== beforeRow?.id) {
          setChosen(list => (list.some(item => item.id === afterRow.id) ? list : [...list, { id: afterRow.id, name: afterRow.name }]));
          showToast(tr('auth.review.customerAdded', { name: afterRow.name }));
          return;
        }
      }
      // Nothing was created and the facility still has no customer: there is nothing to search.
      if (!result.any) return;
      setReopenQuery(lastQueryRef.current);
      setSheetOpen(true);
    })();
  }, [role, isFocused, refresh, profileId]);

  // The customer with the person's own mobile (a customer who asked for access is usually that customer).
  useEffect(() => {
    // Cleared at once only when another person is picked; a refresh keeps it until the answer comes.
    if (suggestionForRef.current !== selectedUser) { suggestionForRef.current = selectedUser; setSuggestion(null); }
    const profile = pending.find(item => item.id === selectedUser);
    if (!profile) return undefined;
    const digits = nationalMobileDigits(profile.mobile);
    if (digits.length < 10) return undefined;
    let current = true;
    customerService.searchCustomers(digits, 5)
      .then(results => {
        const active = results.filter(customer => customer.active !== false);
        if (current) setSuggestion(active.length === 1 ? { forUser: profile.id, customer: { id: active[0].id, name: active[0].name } } : null);
      })
      .catch(() => { /* A suggestion is a convenience: no suggestion when the search fails. */ });
    return () => { current = false; };
  }, [selectedUser, pending]);

  // The options of the picked request open under it: scroll to it and move screen-reader focus to "Approve as".
  const revealOptions = useCallback(() => {
    revealPendingRef.current = false;
    scrollRef.current?.scrollTo({ y: Math.max(0, cardYRef.current - space.sm), animated: true });
    setTimeout(() => {
      const node = roleLabelRef.current ? findNodeHandle(roleLabelRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 400);
  }, []);

  const searchCustomers = useCallback(async (query: string): Promise<CustomerHit[]> => {
    lastQueryRef.current = query;
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

  const applySuggestion = useCallback((customer: ChosenCustomer) => {
    setChosen(list => (list.some(item => item.id === customer.id) ? list : [...list, customer]));
  }, []);

  // No customer matches: add one, then come back to this request with the same person selected.
  const startAddFlow = useCallback(() => {
    addFlowRef.current = true;
    beforeAddRef.current = profileId ? newestOwnCustomer(profileId).catch(() => undefined) : null;
  }, [profileId]);
  const addCustomerFromPicker = useCallback(() => {
    startAddFlow();
    setSheetOpen(false);
    router.push('/customer-form');
  }, [startAddFlow]);
  const reopenValue = useMemo(() => (reopenQuery ? { id: '', name: reopenQuery } : null), [reopenQuery]);

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
                getAppErrorCode(failure) === 'REFUSED' && failure instanceof Error
                  ? failure.message
                  : transportText(failure, { write: true, form: true }) ?? tr('common.checkConnection')
              );
              setBusy(false);
              // The decision may have been saved or handled by someone else: show what is left.
              void refresh();
              return;
            }
            // The decision is saved. A failed reload is its own error and never says "Couldn't save".
            const done = decision === 'approved'
              ? tr(approveAs === 'customer' ? 'auth.review.approvedCustomer' : approveAs === 'staff' ? 'auth.review.approvedStaff' : 'auth.review.approvedSupervisor', { name })
              : tr('auth.review.rejectedNotice', { name });
            showToast(done);
            // The Users list underneath keeps its rows: tell it this person's status changed.
            publishUserListChange({ kind: 'refresh' });
            setPending(list => list.filter(item => item.id !== profile.id));
            setSelectedUser(null);
            setChosen([]);
            setApproveAs('customer');
            try {
              const [enrollments, any] = await Promise.all([listPendingEnrollments(), hasEnrollmentCustomers().catch(() => true)]);
              setPending(enrollments);
              setHasCustomers(any);
            } catch (failure) {
              setError(transportText(failure) ?? tr('auth.review.couldNotLoad'));
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
        ref={scrollRef}
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
            // The request and, when it is picked, its options: one card that opens in place.
            <View
              key={profile.id}
              style={[styles.card, selected && styles.cardSelected]}
              onLayout={event => {
                if (!selected) return;
                cardYRef.current = event.nativeEvent.layout.y;
                if (revealPendingRef.current) revealOptions();
              }}
            >
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={`${name}, ${formatMobile(profile.mobile)}, ${tr('auth.review.askedOn', { date: formatDate(profile.created_at) })}`}
                onPress={() => {
                  if (selected) { revealOptions(); return; }
                  revealPendingRef.current = true;
                  setSelectedUser(profile.id);
                  setChosen([]);
                  setApproveAs('customer');
                }}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed, selected && styles.rowSelected]}
              >
                <Icon name="account-outline" size={iconSize.lg} color={t.icon.secondary} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={2}>{name}</Text>
                  <Text style={styles.meta}>{formatMobile(profile.mobile)}</Text>
                  <Text style={styles.asked}>{tr('auth.review.askedOn', { date: formatDate(profile.created_at) })}</Text>
                </View>
                {selected && <Icon name="check" size={iconSize.md} color={t.brand.tint} />}
              </Pressable>
              {selected && (
                <View style={styles.section}>
                  <RadioGroup
                    label={tr('auth.review.roleLabel')}
                    labelRef={roleLabelRef}
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
                      {suggestion && suggestion.forUser === profile.id && !chosen.some(item => item.id === suggestion.customer.id) && (
                        <View style={styles.suggestion}>
                          <Text style={styles.suggestionText}>{tr('auth.review.suggested', { name: suggestion.customer.name })}</Text>
                          <Button
                            type="secondary"
                            onPress={() => applySuggestion(suggestion.customer)}
                            accessibilityLabel={tr('auth.review.useSuggestedLabel', { name: suggestion.customer.name })}
                          >
                            {tr('auth.review.useSuggested')}
                          </Button>
                        </View>
                      )}
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
                        <Button type="secondary" leftIcon="plus" onPress={() => { lastQueryRef.current = ''; setReopenQuery(null); setSheetOpen(true); }} disabled={busy}>
                          {tr('auth.review.addCustomer')}
                        </Button>
                      ) : (
                        <>
                          <Text style={styles.subtitle}>{tr('auth.review.noCustomers')}</Text>
                          <Button type="secondary" leftIcon="plus" onPress={() => { startAddFlow(); router.push('/customer-form'); }}>
                            {tr('auth.review.addCustomer')}
                          </Button>
                        </>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {person && (
        <View style={[styles.decisionBar, { paddingBottom: insets.bottom + space.md }]} testID="decision-bar">
          <Button size="fullWidth" onPress={() => decide('approved')} disabled={busy}>{tr(APPROVE_LABEL[approveAs])}</Button>
          <Button size="fullWidth" type="secondary" variant="negative" onPress={() => decide('rejected')} disabled={busy}>{tr('auth.review.rejectAction')}</Button>
        </View>
      )}

      <SearchableBottomSheet<CustomerHit>
        isVisible={sheetOpen}
        onClose={() => { setSheetOpen(false); setReopenQuery(null); }}
        currentValue={reopenValue}
        onSelect={addChosen}
        title={tr('auth.review.searchTitle')}
        placeholder={tr('customers.search.placeholder')}
        searchFn={searchCustomers}
        searchErrorText={tr('customers.search.failed')}
        emptyAction={{ label: tr('auth.review.newCustomer'), onPress: addCustomerFromPicker }}
        emptyActionAfterSearchOnly
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
  card: { gap: space.md, borderRadius: radius.card },
  cardSelected: { padding: space.sm, backgroundColor: t.surface.selected, borderColor: t.brand.tint, borderWidth: 2 },
  section: { gap: space.md },
  asked: { ...typography.footnote, color: t.text.secondary },
  suggestion: { gap: space.sm },
  suggestionText: { ...typography.subhead, color: t.text.primary },
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
  rowSelected: { backgroundColor: 'transparent', borderColor: 'transparent' },
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
