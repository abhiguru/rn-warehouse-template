/**
 * Rack buttons (Settings > Warehouse tools, administrators and supervisors): the Floor and Chamber buttons under Rack
 * on the GRN item form (backend migration 131). One list per facility, the same buttons on every phone. Names can be
 * added, renamed, moved and removed; racks already saved never change. A save from an older list is refused by the
 * server ("Someone else changed the rack buttons"), and the person reloads.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { canOpenScreen } from '@/config/roles';
import { getRackPresets, setRackPresets, type RackPresetsAnswer } from '@/services/rackPresetsService';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { showAlert } from '@/utils/alert';
import { transportText } from '@/utils/serverText';

type ListName = 'floor' | 'chamber';

export default function RackPresetsScreen() {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const isFocused = useIsFocused();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const allowed = canOpenScreen(role, 'rackPresets');
  const [loaded, setLoaded] = useState<RackPresetsAnswer | null>(null);
  const [draft, setDraft] = useState<Record<ListName, string[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBusy(true);
    setError(null);
    try {
      const answer = await getRackPresets({ refresh: true });
      if (request !== requestRef.current) return;
      if (!answer) {
        setError(tr('settings.rackPresets.loadFailed'));
        return;
      }
      setLoaded(answer);
      setDraft({ floor: [...answer.floor], chamber: [...answer.chamber] });
    } catch (failure) {
      if (request === requestRef.current) setError(transportText(failure) ?? tr('settings.rackPresets.loadFailed'));
    } finally {
      if (request === requestRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed || !isFocused) return undefined;
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [allowed, isFocused, load]);

  const header = (
    <Stack.Screen
      options={{ title: tr('settings.rackPresets.title'), headerShown: true, headerTitleAlign: 'center', headerLeft: () => <HeaderBackButton /> }}
    />
  );

  if (!allowed) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {header}
        <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
        <Icon name="account-lock-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.stateTitle} accessibilityRole="header">{tr('settings.rackPresets.adminsOnlyTitle')}</Text>
        <Text style={styles.stateMessage}>{tr('settings.rackPresets.adminsOnlyMessage')}</Text>
        <Button onPress={() => router.replace('/settings')}>{tr('numbering.screen.backToSettings')}</Button>
      </View>
    );
  }

  const change = (list: ListName, update: (labels: string[]) => string[]) =>
    setDraft(current => (current ? { ...current, [list]: update(current[list]) } : current));
  const move = (list: ListName, index: number, by: -1 | 1) =>
    change(list, labels => {
      const to = index + by;
      if (to < 0 || to >= labels.length) return labels;
      const next = [...labels];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const dirty =
    !!loaded && !!draft && (draft.floor.join('\n') !== loaded.floor.join('\n') || draft.chamber.join('\n') !== loaded.chamber.join('\n'));

  const save = async () => {
    if (!loaded || !draft || saving) return;
    setSaving(true);
    try {
      // Names are sent as typed, only the spaces at their ends dropped; the server checks them all.
      const result = await setRackPresets(
        { floor: draft.floor.map(label => label.trim()), chamber: draft.chamber.map(label => label.trim()) },
        loaded.version
      );
      if (result.ok) {
        setLoaded(result.answer);
        setDraft({ floor: [...result.answer.floor], chamber: [...result.answer.chamber] });
        showToast(tr(result.changed ? 'settings.rackPresets.saved' : 'settings.rackPresets.unchanged'));
      } else if (result.unconfirmed) {
        // The edit stays; sending it again is safe.
        showAlert(tr('settings.rackPresets.title'), result.message, [
          { text: tr('common.cancel'), style: 'cancel' },
          { text: tr('common.retry'), onPress: () => void save() },
        ]);
      } else if (result.changedByOthers) {
        showAlert(tr('settings.rackPresets.title'), result.message, [{ text: tr('settings.rackPresets.reload'), onPress: () => void load() }]);
      } else {
        showAlert(tr('settings.rackPresets.title'), result.message);
      }
    } catch (failure) {
      showAlert(tr('settings.rackPresets.title'), transportText(failure, { write: true, form: true }) ?? tr('settings.rackPresets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const section = (list: ListName, title: string) => {
    const labels = draft?.[list] ?? [];
    const max = loaded?.maxPerList ?? 20;
    return (
      <View style={styles.section} testID={`rack-presets-${list}`}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
        {labels.map((label, index) => (
          <View key={`${list}-${index}`} style={styles.row}>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={text => change(list, current => current.map((entry, at) => (at === index ? text : entry)))}
              maxLength={loaded?.maxLabelLength ?? 12}
              placeholder={tr('settings.rackPresets.labelHint')}
              placeholderTextColor={t.text.placeholder}
              autoCapitalize="characters"
              accessibilityLabel={tr('settings.rackPresets.inputLabel', { list: title, position: index + 1 })}
              testID={`rack-presets-${list}-${index}`}
            />
            <Pressable
              style={styles.iconButton}
              onPress={() => move(list, index, -1)}
              disabled={index === 0}
              accessibilityRole="button"
              accessibilityLabel={tr('settings.rackPresets.moveUpLabel', { label: label || String(index + 1) })}
              accessibilityState={{ disabled: index === 0 }}
            >
              <Icon name="arrow-up" size={iconSize.md} color={index === 0 ? t.text.disabled : t.icon.primary} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => move(list, index, 1)}
              disabled={index === labels.length - 1}
              accessibilityRole="button"
              accessibilityLabel={tr('settings.rackPresets.moveDownLabel', { label: label || String(index + 1) })}
              accessibilityState={{ disabled: index === labels.length - 1 }}
            >
              <Icon name="arrow-down" size={iconSize.md} color={index === labels.length - 1 ? t.text.disabled : t.icon.primary} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => change(list, current => current.filter((_, at) => at !== index))}
              accessibilityRole="button"
              accessibilityLabel={tr('settings.rackPresets.removeLabel', { label: label || String(index + 1) })}
              testID={`rack-presets-${list}-${index}-remove`}
            >
              <Icon name="close" size={iconSize.md} color={t.icon.primary} />
            </Pressable>
          </View>
        ))}
        {labels.length < max ? (
          <Button
            type="tertiary"
            onPress={() => change(list, current => [...current, ''])}
            accessibilityLabel={tr('settings.rackPresets.addLabel', { list: title })}
            testID={`rack-presets-${list}-add`}
          >
            {tr('settings.rackPresets.addButton')}
          </Button>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {header}
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{tr('settings.rackPresets.intro')}</Text>
        {busy && !draft ? <ActivityIndicator style={styles.loading} color={t.brand.tint} accessibilityLabel={tr('common.loading')} /> : null}
        {!draft && !busy && error ? (
          <View style={styles.errorBox} testID="rack-presets-error">
            <Text style={styles.stateMessage} accessibilityRole="alert">{error}</Text>
            <Button type="secondary" onPress={() => void load()}>{tr('common.retry')}</Button>
          </View>
        ) : null}
        {draft ? (
          <>
            {section('floor', tr('settings.rackPresets.floorTitle'))}
            {section('chamber', tr('settings.rackPresets.chamberTitle'))}
          </>
        ) : null}
      </ScrollView>
      {draft ? (
        <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
          <Button size="fullWidth" onPress={() => void save()} disabled={!dirty || saving} loading={saving} testID="rack-presets-save">
            {tr('settings.rackPresets.save')}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background.grouped },
    intro: { ...typography.footnote, color: t.text.secondary, marginHorizontal: layout.marginCompact, marginVertical: space.lg },
    loading: { marginTop: space.xxl },
    errorBox: { marginHorizontal: layout.marginCompact, gap: space.md, alignItems: 'center' },
    section: { marginHorizontal: layout.marginCompact, marginBottom: space.xl, gap: space.sm },
    sectionTitle: { ...typography.headline, color: t.text.primary },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    input: {
      flex: 1,
      minHeight: touchTarget,
      ...typography.body,
      color: t.text.primary,
      backgroundColor: t.surface.field,
      borderWidth: 1,
      borderColor: t.border.field,
      borderRadius: radius.field,
      paddingHorizontal: space.md,
    },
    iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
    footer: { paddingHorizontal: layout.marginCompact, paddingTop: space.md, backgroundColor: t.surface.card },
    stateScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.md,
      padding: layout.marginCompact,
      backgroundColor: t.background.base,
    },
    stateTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' },
    stateMessage: { ...typography.body, color: t.text.secondary, textAlign: 'center' },
  });
