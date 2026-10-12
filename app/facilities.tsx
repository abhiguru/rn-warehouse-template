/**
 * My facilities (style guide §14.8 step 3, docs/CENTRAL_LOGIN.md): the
 * person's own list of cold storages, kept on this phone, each with the status
 * that facility last answered with. Opening one asks the facility again; no
 * facility is contacted in the background.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { CentralHeader } from '@/components/central/CentralHeader';
import { Button } from '@/components/ui/Button';
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag';
import { useAppDispatch } from '@/store/hooks';
import { signOutEverywhere } from '@/store/centralSignOut';
import { useCentralState } from '@/hooks/useCentralState';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { setCentralState, type FacilityStatus } from '@/config/centralState';
import { fetchCentralProfile } from '@/config/centralSession';
import {
  loadMyFacilities,
  onMyFacilitiesChange,
  soleApprovedFacility,
  type MyFacility,
} from '@/config/centralFacilities';
import { beginFacilitySmsSignIn, consumeOpenOutcome, openFacility } from '@/config/openFacility';
import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr, type TranslationKey } from '@/i18n';

/** Status tag per facility status (style guide §14.8): the word and its colour role. */
export const FACILITY_STATUS_VIEW: Record<FacilityStatus, { kind: StatusKind; label: TranslationKey }> = {
  approved: { kind: 'positive', label: 'auth.enrollment.status.approved' },
  requested: { kind: 'critical', label: 'auth.enrollment.status.pending' },
  revoked: { kind: 'negative', label: 'auth.enrollment.status.disabled' },
  link_needed: { kind: 'neutral', label: 'central.facilities.status.linkNeeded' },
  unavailable: { kind: 'neutral', label: 'central.facilities.status.unavailable' },
};

export default function FacilitiesScreen() {
  const dispatch = useAppDispatch();
  const central = useCentralState();
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const userId = central.user?.id ?? '';
  const [list, setList] = useState<MyFacility[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const opening = central.opening;

  const load = useCallback(async () => {
    setList(await loadMyFacilities(userId));
  }, [userId]);

  useEffect(() => {
    void load();
    return onMyFacilitiesChange(() => { void load(); });
  }, [load]);

  // At start, exactly one approved facility and nothing else waiting: open it without
  // showing the list. One chance per start; "Switch facility" spends it before coming here.
  const autoOpenSpent = central.autoOpenSpent;
  const hasOutcome = central.outcome !== null;
  useEffect(() => {
    if (list === null || autoOpenSpent) return;
    setCentralState({ autoOpenSpent: true });
    const sole = soleApprovedFacility(list);
    if (sole && !opening && !hasOutcome) void openFacility(sole.origin, sole.name);
  }, [list, autoOpenSpent, opening, hasOutcome]);

  // The answer of an open. It is held outside this screen, because opening a facility
  // rebuilds the navigation tree and the screen that started it may be gone.
  const outcome = central.outcome;
  useEffect(() => {
    if (!outcome) return;
    consumeOpenOutcome(outcome.id);
    const { origin, name } = outcome;
    const result = outcome.outcome;
    // `login` needs nothing here: the profile is in the store and the route guard enters the facility.
    if (result.kind === 'pending') router.push('/pending-enrollment');
    else if (result.kind === 'link_required') {
      if (!result.codeSent && result.message) showAlert(tr('central.link.notSentTitle'), result.message);
      router.push('/facility-link');
    } else if (result.kind === 'sms_offer') {
      showAlert(tr('central.open.smsOfferTitle'), tr('central.open.smsOfferMessage', { facility: name }), [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('common.continue'),
          onPress: () => {
            // On success the route guard shows the facility's own sign-in screen.
            void beginFacilitySmsSignIn(origin, name).then(begun => {
              if (begun.kind === 'failed') showAlert(tr('central.open.failedTitle', { facility: name }), begun.message);
            });
          },
        },
      ]);
    } else if (result.kind === 'failed') {
      showAlert(tr('central.open.failedTitle', { facility: name }), result.message);
    }
  }, [outcome]);

  // Pull to refresh reads the list again and asks the association who is signed in.
  // A facility's status is checked only when that facility is opened.
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), fetchCentralProfile()]);
    } finally {
      setRefreshing(false);
    }
  };

  const confirmSignOut = () => {
    showAlert(tr('auth.signOut.confirmTitle'), tr('central.signOut.confirmMessage'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('auth.signOut.action'),
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void signOutEverywhere(dispatch)
            .then(result => {
              if (!result.ok) showAlert(tr('auth.signOut.couldNotTitle'), tr('central.switch.busyMessage'));
            })
            .finally(() => setSigningOut(false));
        },
      },
    ]);
  };

  const busy = opening !== null || signingOut;
  const personName = central.user?.name || tr('central.facilities.accountLabel');
  const personPhone = formatMobile(central.user?.phoneNumber);

  const renderFacility = ({ item }: { item: MyFacility }) => {
    const view = FACILITY_STATUS_VIEW[item.status];
    const status = tr(view.label);
    const isOpening = opening === item.origin;
    return (
      <Pressable
        style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
        onPress={() => { void openFacility(item.origin, item.name); }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={
          item.city
            ? tr('central.facilities.cellLabelCity', { name: item.name, city: item.city, status })
            : tr('central.facilities.cellLabel', { name: item.name, status })
        }
        accessibilityHint={tr('central.facilities.cellHint')}
        accessibilityState={{ disabled: busy, busy: isOpening }}
        testID={`facility-${item.origin}`}
      >
        <View style={styles.avatar}>
          <Icon name="office-building-outline" size={iconSize.lg} color={t.brand.tint} />
        </View>
        <View style={styles.cellText}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          {item.city ? <Text style={styles.city} numberOfLines={1}>{item.city}</Text> : null}
          {isOpening ? <Text style={styles.city}>{tr('central.facilities.opening', { facility: item.name })}</Text> : null}
        </View>
        <View style={styles.cellEnd}>
          <StatusTag status={view.kind} label={status} testID={`facility-status-${item.origin}`} />
        </View>
        {isOpening ? (
          <ActivityIndicator color={t.brand.tint} />
        ) : (
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <CentralHeader title={tr('central.facilities.title')} />

      <FlatList
        data={list ?? []}
        keyExtractor={item => item.origin}
        renderItem={renderFacility}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={Separator}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={t.brand.tint} colors={[t.brand.tint]} />
        }
        ListHeaderComponent={
          <Pressable
            style={({ pressed }) => [styles.account, pressed && styles.cellPressed]}
            onPress={() => router.push('/central-account')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`${personName}, ${personPhone}`}
            accessibilityHint={tr('central.facilities.accountHint')}
            testID="central-account-row"
          >
            <Icon name="account-circle-outline" size={iconSize.xl} color={t.icon.secondary} />
            <View style={styles.cellText}>
              <Text style={styles.name} numberOfLines={1}>{personName}</Text>
              <Text style={styles.city} numberOfLines={1}>{personPhone}</Text>
            </View>
            <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        }
        ListEmptyComponent={
          list === null ? (
            <View style={styles.empty}>
              <ActivityIndicator color={t.brand.tint} accessibilityLabel={tr('central.facilities.loading')} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Icon name="office-building-plus-outline" size={iconSize.hero} color={t.icon.secondary} />
              <Text style={styles.emptyTitle}>{tr('central.facilities.emptyTitle')}</Text>
              <Text style={styles.emptyMessage}>{tr('central.facilities.emptyMessage')}</Text>
            </View>
          )
        }
        ListFooterComponent={
          list && list.length > 0 ? <Text style={styles.footnote}>{tr('central.facilities.refreshNote')}</Text> : null
        }
      />

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.lg }]}>
        <Button size="fullWidth" leftIcon="plus" onPress={() => router.push('/facility-catalogue')} disabled={busy}>
          {tr('central.facilities.add')}
        </Button>
        <Button
          type="tertiary"
          variant="negative"
          size="fullWidth"
          onPress={confirmSignOut}
          disabled={busy}
          loading={signingOut}
        >
          {tr('auth.signOut.action')}
        </Button>
      </View>
    </View>
  );
}

function Separator() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.separator} />;
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  listContent: {
    flexGrow: 1,
    width: '100%' as const,
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center' as const,
    paddingBottom: space.lg,
  },
  account: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
    marginHorizontal: layout.marginCompact,
    marginVertical: space.lg,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    ...t.shadow[1],
  },
  // Object cell (style guide §13.6)
  cell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: 72,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    backgroundColor: t.surface.card,
  },
  cellPressed: { backgroundColor: t.surface.cardPressed },
  avatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cellText: { flex: 1, gap: space.xxs },
  cellEnd: { flexShrink: 0 },
  name: { ...typography.headline, color: t.text.primary },
  city: { ...typography.subhead, color: t.text.secondary },
  separator: { height: 1, backgroundColor: t.border.divider, marginLeft: layout.marginCompact + layout.avatar.md + space.md },
  empty: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.xxl, gap: space.sm },
  emptyTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  emptyMessage: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  footnote: {
    ...typography.footnote,
    color: t.text.secondary,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
  },
  actions: {
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
});
