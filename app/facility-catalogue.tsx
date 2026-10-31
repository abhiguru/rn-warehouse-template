/**
 * Add facility (docs/CENTRAL_LOGIN.md, style guide §14.8): the association's list
 * of member cold storages, searched by name, town or district, each tagged with
 * whether the association's service reached it at its last check
 * (src/config/catalogueView.ts). Picking one puts it on the person's list and
 * opens it. A member with no app server yet is listed greyed and only explains
 * why it cannot be added. "Enter address" is for a facility that is not in the
 * list.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { CentralHeader } from '@/components/central/CentralHeader';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Input';
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag';
import { useCentralState } from '@/hooks/useCentralState';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fetchFacilityCatalogue, type CatalogueFacility } from '@/config/centralSession';
import {
  catalogueAvailability,
  lastSeenText,
  placeText,
  sortCatalogue,
  type CatalogueAvailability,
} from '@/config/catalogueView';
import { addMyFacility, loadMyFacilities, noteCatalogueRead } from '@/config/centralFacilities';
import { openFacility } from '@/config/openFacility';
import { showAlert } from '@/utils/alert';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { normalizeDigits, t as tr, type TranslationKey } from '@/i18n';

type Catalogue =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; facilities: CatalogueFacility[] };

/**
 * One tag per row (style guide §3.5): the availability the association's service reported.
 * No tag when nothing is reported (a catalogue from before central service 0.8.0).
 */
export const CATALOGUE_STATUS_VIEW: Record<CatalogueAvailability, { kind: StatusKind; label: TranslationKey }> = {
  online: { kind: 'positive', label: 'central.catalogue.status.online' },
  offline: { kind: 'negative', label: 'central.catalogue.status.offline' },
  no_server: { kind: 'neutral', label: 'central.catalogue.status.noServer' },
};

/** Name, town, district or city contains what was typed, whatever the letter case. */
export function matchesFacilitySearch(
  facility: { name: string; city: string; town?: string; district?: string },
  search: string
): boolean {
  const wanted = normalizeDigits(search).trim().toLowerCase();
  if (!wanted) return true;
  return [facility.name, facility.town ?? '', facility.district ?? '', facility.city].some(field =>
    field.toLowerCase().includes(wanted)
  );
}

export default function FacilityCatalogueScreen() {
  const userId = useCentralState().user?.id ?? '';
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [catalogue, setCatalogue] = useState<Catalogue>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Why the last pull to refresh failed; the rows it could not replace stay. */
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    setCatalogue({ kind: 'loading' });
    setRefreshError(null);
    const result = await fetchFacilityCatalogue({ force });
    if (result.ok && userId) void noteCatalogueRead(userId, result.facilities.map(f => f.origin));
    setCatalogue(result.ok ? { kind: 'ready', facilities: result.facilities } : { kind: 'error', message: result.message });
  }, []);

  // Pull to refresh asks the service again (never a cached copy) and keeps the rows while it
  // waits, so the list does not blank; a failure keeps them and says why under the search field.
  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await fetchFacilityCatalogue({ force: true });
      if (result.ok) {
        if (userId) void noteCatalogueRead(userId, result.facilities.map(f => f.origin));
        setCatalogue({ kind: 'ready', facilities: result.facilities });
        setRefreshError(null);
      } else {
        setRefreshError(result.message);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    let active = true;
    void loadMyFacilities(userId).then(list => {
      if (active) setMine(new Set(list.map(entry => entry.origin)));
    });
    return () => { active = false; };
  }, [userId]);

  const facilities = catalogue.kind === 'ready' ? catalogue.facilities : null;
  const shown = useMemo(
    () => sortCatalogue(facilities ?? []).filter(facility => matchesFacilitySearch(facility, search)),
    [facilities, search]
  );

  const pick = async (facility: CatalogueFacility) => {
    const origin = facility.origin;
    // A member with no app server yet has nothing to add or open; its row explains that instead.
    if (picking || !userId || !origin) return;
    setPicking(true);
    try {
      await addMyFacility(userId, { origin, name: facility.name, city: facility.town || facility.city, source: 'catalogue' });
      // The answer of the open is shown on My facilities.
      router.back();
      void openFacility(origin, facility.name);
    } finally {
      setPicking(false);
    }
  };

  const explainNoServer = (facility: CatalogueFacility) => {
    showAlert(tr('central.catalogue.noServerTitle', { name: facility.name }), tr('central.catalogue.noServerMessage'));
  };

  const enterAddress = (
    <Button type="secondary" size="fullWidth" leftIcon="link-variant" onPress={() => router.push('/facility-address')} disabled={picking}>
      {tr('central.catalogue.enterAddress')}
    </Button>
  );

  const renderFacility = ({ item }: { item: CatalogueFacility }) => {
    const availability = catalogueAvailability(item);
    const noServer = availability === 'no_server';
    const view = availability ? CATALOGUE_STATUS_VIEW[availability] : null;
    const status = view ? tr(view.label) : null;
    const place = placeText(item);
    const lastSeen = availability === 'offline' ? lastSeenText(item.lastSeenAt) : null;
    const onList = item.origin !== null && mine.has(item.origin) ? tr('central.catalogue.onYourList') : null;
    return (
      <Pressable
        style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
        onPress={() => {
          if (noServer) explainNoServer(item);
          else void pick(item);
        }}
        disabled={picking}
        accessibilityRole="button"
        accessibilityLabel={[item.name, place, status, lastSeen, onList].filter(Boolean).join(', ')}
        accessibilityHint={tr(noServer ? 'central.catalogue.noServerHint' : 'central.catalogue.cellHint')}
        testID={`catalogue-${item.id}`}
      >
        {/* A member with no app server yet is greyed with the secondary tokens, never with opacity. */}
        <View style={[styles.avatar, noServer && styles.avatarMuted]}>
          <Icon name="office-building-outline" size={iconSize.lg} color={noServer ? t.icon.secondary : t.brand.tint} />
        </View>
        <View style={styles.cellText}>
          <Text style={[styles.name, noServer && styles.nameMuted]} numberOfLines={2}>{item.name}</Text>
          {place ? <Text style={styles.place} numberOfLines={1}>{place}</Text> : null}
          {/* The tag sits under the text, not at the row's end, so a long member name keeps the width. */}
          {view && status ? (
            <View style={styles.statusLine}>
              <StatusTag status={view.kind} label={status} testID={`catalogue-status-${item.id}`} />
              {lastSeen ? <Text style={styles.footnote} testID={`catalogue-last-seen-${item.id}`}>{lastSeen}</Text> : null}
            </View>
          ) : null}
          {onList ? (
            <View style={styles.footnoteLine}>
              <Icon name="check" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.footnote}>{onList}</Text>
            </View>
          ) : null}
        </View>
        <Icon name={noServer ? 'information-outline' : 'chevron-right'} size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
    );
  };

  let body: React.ReactNode;
  if (catalogue.kind === 'loading') {
    body = (
      <View style={styles.state}>
        <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel={tr('central.catalogue.loading')} />
      </View>
    );
  } else if (catalogue.kind === 'error') {
    body = (
      <View style={styles.state}>
        <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
        <Text style={styles.stateTitle} accessibilityRole="header">{tr('central.catalogue.errorTitle')}</Text>
        <Text style={styles.stateMessage}>{catalogue.message}</Text>
        <Button type="secondary" size="standalone" onPress={() => { void load(true); }}>{tr('common.retry')}</Button>
      </View>
    );
  } else if (catalogue.facilities.length === 0) {
    body = (
      <View style={styles.state}>
        <Icon name="office-building-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.stateTitle} accessibilityRole="header">{tr('central.catalogue.emptyTitle')}</Text>
        <Text style={styles.stateMessage}>{tr('central.catalogue.emptyMessage')}</Text>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={shown}
        keyExtractor={item => item.id}
        renderItem={renderFacility}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={Separator}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={t.brand.tint} colors={[t.brand.tint]} />
        }
        ListEmptyComponent={
          <View style={styles.state}>
            <Icon name="magnify" size={iconSize.hero} color={t.icon.secondary} />
            <Text style={styles.stateTitle}>{tr('central.catalogue.noMatchTitle', { search: search.trim() })}</Text>
            <Text style={styles.stateMessage}>{tr('central.catalogue.noMatchMessage')}</Text>
          </View>
        }
      />
    );
  }

  return (
    <View style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <CentralHeader title={tr('central.facilities.add')} onBack={() => router.back()} />
      <View style={styles.column}>
        {facilities && facilities.length > 0 ? (
          <View style={styles.search}>
            <SearchInput
              value={search}
              onChangeText={setSearch}
              placeholder={tr('central.catalogue.searchPlaceholder')}
              accessibilityLabel={tr('central.catalogue.searchLabel')}
              leftIcon={<Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />}
              showClearButton
              containerStyle={styles.searchField}
              testID="catalogue-search"
            />
            {refreshError ? (
              <Text style={styles.refreshError} accessibilityLiveRegion="polite" testID="catalogue-refresh-error">
                {tr('central.catalogue.refreshFailed', { message: refreshError })}
              </Text>
            ) : null}
          </View>
        ) : null}
        {body}
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + space.lg }]}>
        <Text style={styles.actionsHint}>{tr('central.catalogue.enterAddressHint')}</Text>
        {enterAddress}
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
  column: { flex: 1, width: '100%' as const, maxWidth: layout.maxContentWidth, alignSelf: 'center' as const },
  search: { paddingHorizontal: layout.marginCompact, paddingTop: space.md },
  searchField: { marginBottom: space.md },
  listContent: { flexGrow: 1, paddingBottom: space.lg },
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
  avatarMuted: { backgroundColor: t.background.base },
  cellText: { flex: 1, gap: space.xxs },
  name: { ...typography.headline, color: t.text.primary },
  nameMuted: { color: t.text.secondary },
  place: { ...typography.subhead, color: t.text.secondary },
  statusLine: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    columnGap: space.sm,
    rowGap: space.xxs,
    marginTop: space.xxs,
  },
  footnoteLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  footnote: { ...typography.footnote, color: t.text.secondary, flexShrink: 1 },
  refreshError: { ...typography.footnote, color: t.status.negative.text, marginBottom: space.md },
  separator: { height: 1, backgroundColor: t.border.divider, marginLeft: layout.marginCompact + layout.avatar.md + space.md },
  state: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.xxl, gap: space.md },
  stateTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  stateMessage: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  actions: {
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  actionsHint: { ...typography.footnote, color: t.text.secondary, textAlign: 'center' as const },
});
