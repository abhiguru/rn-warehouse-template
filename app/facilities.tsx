/**
 * My facilities (style guide §14.8 step 3, docs/CENTRAL_LOGIN.md): the
 * person's own list of cold storages, kept on this phone, each with the status
 * that facility last answered with. Opening one asks the facility again; no
 * facility is contacted in the background.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { CentralHeader } from '@/components/central/CentralHeader';
import { Button } from '@/components/ui/Button';
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag';
import { useAppDispatch } from '@/store/hooks';
import { signOutPhoneWithMessages } from '@/features/account/useAccountActions';
import { useCentralState } from '@/hooks/useCentralState';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { setCentralState, type FacilityStatus, type OpenFailureReason } from '@/config/centralState';
import { fetchCentralProfile } from '@/config/centralSession';
import {
  loadMyFacilities,
  onMyFacilitiesChange,
  soleApprovedFacility,
  type MyFacility,
} from '@/config/centralFacilities';
import { beginFacilitySmsSignIn, consumeOpenOutcome, EARLIER_SESSION_TITLES, openFacility } from '@/config/openFacility';
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

/**
 * Titles of a failed answer that are not "Couldn't open <facility>". An answer about an
 * earlier sign-in's facility session names no facility: it was not this person's.
 */
const FAILED_TITLES: Partial<Record<OpenFailureReason, TranslationKey>> = {
  account_deletion: 'central.account.deleteFailedTitle',
  account_deletion_unknown: 'central.account.deleteUnknownTitle',
  ...EARLIER_SESSION_TITLES,
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
  const leaving = central.leaving > 0;
  const focused = useIsFocused();
  useEffect(() => {
    if (list === null || autoOpenSpent) return;
    if (!focused) {
      // Left for another screen while a sign-out was finishing: the chance is gone.
      if (leaving) setCentralState({ autoOpenSpent: true });
      return;
    }
    // Not while a sign-out is still finishing: the open would be refused with a dialog nobody asked for.
    if (leaving) return;
    setCentralState({ autoOpenSpent: true });
    const sole = soleApprovedFacility(list);
    if (sole && !opening && !hasOutcome) void openFacility(sole.origin, sole.name);
  }, [list, autoOpenSpent, leaving, focused, opening, hasOutcome]);

  // The answer of an open. It is held outside this screen, because opening a facility
  // rebuilds the navigation tree and the screen that started it may be gone.
  const outcome = central.outcome;
  useEffect(() => {
    // Taken by one screen only: a second My facilities in the stack sees the same answer.
    if (!outcome || !consumeOpenOutcome(outcome.id)) return;
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
      const title = FAILED_TITLES[result.reason];
      showAlert(title ? tr(title, { facility: name }) : tr('central.open.failedTitle', { facility: name }), result.message);
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
          // The same sign-out and messages as "Sign out of this phone" inside a facility.
          void signOutPhoneWithMessages(dispatch);
        },
      },
    ]);
  };

  // Nothing here is silent while the phone signs out or a facility opens: the rows, your name,
  // Add facility and Sign out stay pressable but are dimmed, and a tap says why it waits.
  // (A row tapped during an open is answered by openFacility.)
  const openingName = opening ? list?.find(f => f.origin === opening)?.name : undefined;
  const waiting = leaving || opening !== null;
  const tellWaiting = () =>
    leaving
      ? showAlert(tr('central.facilities.signingOutTitle'), tr('central.facilities.signingOutMessage'))
      : showAlert(tr('auth.server.busyTitle'), tr('central.facilities.stillOpening', { facility: openingName ?? '' }));
  const personName = central.user?.name || tr('central.facilities.accountLabel');
  const personPhone = formatMobile(central.user?.phoneNumber);

  const renderFacility = ({ item }: { item: MyFacility }) => {
    const view = FACILITY_STATUS_VIEW[item.status];
    const status = tr(view.label);
    const isOpening = opening === item.origin;
    return (
      <Pressable
        style={({ pressed }) => [styles.cell, leaving && styles.cellDimmed, pressed && styles.cellPressed]}
        onPress={() => {
          // A tap during the wait is the person's own choice: the automatic open is not for them any more.
          setCentralState({ autoOpenSpent: true });
          void openFacility(item.origin, item.name);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          item.city
            ? tr('central.facilities.cellLabelCity', { name: item.name, city: item.city, status })
            : tr('central.facilities.cellLabel', { name: item.name, status })
        }
        accessibilityHint={tr('central.facilities.cellHint')}
        accessibilityState={{ busy: isOpening || leaving }}
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
      {leaving ? (
        <View style={styles.strip} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="facilities-signing-out">
          <ActivityIndicator size="small" color={t.status.neutral.text} />
          <Text style={styles.stripText}>{tr('central.facilities.signingOut')}</Text>
        </View>
      ) : null}

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
            style={({ pressed }) => [styles.account, waiting && styles.cellDimmed, pressed && styles.cellPressed]}
            onPress={() => (waiting ? tellWaiting() : router.push('/central-account'))}
            accessibilityRole="button"
            accessibilityLabel={`${personName}, ${personPhone}`}
            accessibilityHint={tr('central.facilities.accountHint')}
            accessibilityState={{ busy: waiting }}
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
        <Button
          size="fullWidth"
          leftIcon="plus"
          onPress={() => (waiting ? tellWaiting() : router.push('/facility-catalogue'))}
          style={waiting ? styles.cellDimmed : undefined}
          accessibilityState={{ busy: waiting }}
        >
          {tr('central.facilities.add')}
        </Button>
        <Button
          type="tertiary"
          variant="negative"
          size="fullWidth"
          onPress={() => (waiting ? tellWaiting() : confirmSignOut())}
          style={waiting ? styles.cellDimmed : undefined}
          accessibilityState={{ busy: waiting }}
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
  cellDimmed: { opacity: t.interaction.disabledOpacity },
  // Under the header, pushing the list down (style guide: banners never cover content)
  strip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.status.neutral.background,
  },
  stripText: { ...typography.subhead, color: t.status.neutral.text, flex: 1 },
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
