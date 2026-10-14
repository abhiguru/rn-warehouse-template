/**
 * Add facility (docs/CENTRAL_LOGIN.md): the association's list of member cold
 * storages, searched by name or city. Picking one puts it on the person's list
 * and opens it. "Enter address" is for a facility that is not in the list.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { CentralHeader } from '@/components/central/CentralHeader';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Input';
import { StatusTag } from '@/components/ui/StatusTag';
import { useCentralState } from '@/hooks/useCentralState';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fetchFacilityCatalogue, type CatalogueFacility } from '@/config/centralSession';
import { addMyFacility, loadMyFacilities } from '@/config/centralFacilities';
import { openFacility } from '@/config/openFacility';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { normalizeDigits, t as tr } from '@/i18n';

type Catalogue =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; facilities: CatalogueFacility[] };

/** Name or city contains what was typed, whatever the letter case. */
export function matchesFacilitySearch(facility: { name: string; city: string }, search: string): boolean {
  const wanted = normalizeDigits(search).trim().toLowerCase();
  if (!wanted) return true;
  return facility.name.toLowerCase().includes(wanted) || facility.city.toLowerCase().includes(wanted);
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

  const load = useCallback(async (force: boolean) => {
    setCatalogue({ kind: 'loading' });
    const result = await fetchFacilityCatalogue({ force });
    setCatalogue(result.ok ? { kind: 'ready', facilities: result.facilities } : { kind: 'error', message: result.message });
  }, []);

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
    () => (facilities ?? []).filter(facility => matchesFacilitySearch(facility, search)),
    [facilities, search]
  );

  const pick = async (facility: CatalogueFacility) => {
    const origin = facility.origin;
    // A member with no app server yet has nothing to add or open.
    if (picking || !userId || !origin) return;
    setPicking(true);
    try {
      await addMyFacility(userId, { origin, name: facility.name, city: facility.town || facility.city });
      // The answer of the open is shown on My facilities.
      router.back();
      void openFacility(origin, facility.name);
    } finally {
      setPicking(false);
    }
  };

  const enterAddress = (
    <Button type="secondary" size="fullWidth" leftIcon="link-variant" onPress={() => router.push('/facility-address')} disabled={picking}>
      {tr('central.catalogue.enterAddress')}
    </Button>
  );

  const renderFacility = ({ item }: { item: CatalogueFacility }) => (
    <Pressable
      style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
      onPress={() => { void pick(item); }}
      disabled={picking}
      accessibilityRole="button"
      accessibilityLabel={tr('central.catalogue.cellLabel', { name: item.name, city: item.city })}
      accessibilityHint={tr('central.catalogue.cellHint')}
      testID={`catalogue-${item.id}`}
    >
      <View style={styles.avatar}>
        <Icon name="office-building-outline" size={iconSize.lg} color={t.brand.tint} />
      </View>
      <View style={styles.cellText}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        {item.city ? <Text style={styles.city} numberOfLines={1}>{item.city}</Text> : null}
      </View>
      {item.origin !== null && mine.has(item.origin) ? <StatusTag status="neutral" label={tr('central.catalogue.onYourList')} icon="check" /> : null}
      <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
    </Pressable>
  );

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
  cellText: { flex: 1, gap: space.xxs },
  name: { ...typography.headline, color: t.text.primary },
  city: { ...typography.subhead, color: t.text.secondary },
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
