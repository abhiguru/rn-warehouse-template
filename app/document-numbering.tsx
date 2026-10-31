/**
 * Document numbers (Settings > Warehouse tools, administrators): how this facility writes GRN, dispatch and invoice
 * numbers (backend migration 127). One row per document type shows its rule in words, whether numbers outside it are
 * refused, and how many existing numbers do not follow it; a tap opens the edit sheet. Existing documents never change
 * their numbers. docs/STYLE_GUIDE.md §14.12 and §13.9.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { SettingsRow, SettingsSection } from '@/features/settings/components/SettingsList';
import { NumberingEditSheet } from '@/features/numbering/NumberingEditSheet';
import { describeRuleLines } from '@/features/numbering/numberingModel';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, t as tr, type TranslationKey } from '@/i18n';
import { canOpenScreen } from '@/config/roles';
import {
  getDocumentNumbering,
  type DocumentType,
  type NumberingRule,
  type SetNumberingResult,
} from '@/services/documentNumberingService';
import { iconSize, layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { transportText } from '@/utils/serverText';
import type { IconName } from '@/types/icon.types';

const TYPE_LABEL: Record<DocumentType, TranslationKey> = {
  grn: 'common.grn',
  dispatch: 'common.dispatch',
  invoice: 'common.invoice',
};
const TYPE_ICON: Record<DocumentType, IconName> = {
  grn: 'package-down',
  dispatch: 'truck-delivery-outline',
  invoice: 'file-document-outline',
};

export default function DocumentNumberingScreen() {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const isFocused = useIsFocused();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [rules, setRules] = useState<NumberingRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const allowed = canOpenScreen(role, 'documentNumbering');
  // The latest read wins: an answer that arrives after a newer request is dropped.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBusy(true);
    setError(null);
    try {
      const next = await getDocumentNumbering();
      if (request === requestRef.current) setRules(next);
    } catch (failure) {
      if (request === requestRef.current) setError(transportText(failure) ?? tr('numbering.screen.loadFailed'));
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

  const saved = useCallback(
    (result: SetNumberingResult) => {
      setEditing(null);
      // The toast says what comes next; the rows below show the rest once they are read again.
      const next = result.changed
        ? result.next_number
          ? tr('numbering.edit.savedNext', { number: formatIdentifier(result.next_number) })
          : tr(result.reason === 'SERIES_FULL' ? 'numbering.edit.savedFull' : 'numbering.edit.savedTypeIt')
        : tr('numbering.edit.unchanged');
      // Numbers that do not follow the new rule are kept; the administrator is told how many.
      const kept = result.changed && result.not_following > 0 ? ` ${tr('numbering.edit.savedNotFollowing', { count: result.not_following })}` : '';
      showToast(result.changed ? `${tr('numbering.edit.savedTitle')}. ${next}${kept}` : next);
      void load();
    },
    [load]
  );

  // "Refresh" in the edit sheet read the rules the server holds: show them. The rule equals the one that was sent: the
  // change went through, the sheet closes. Otherwise the sheet stays open with the person's values.
  const refreshed = useCallback((next: NumberingRule[], savedNow: boolean) => {
    requestRef.current += 1;
    setRules(next);
    setError(null);
    setBusy(false);
    // The rows are also read again, so they show what the server holds now and not only what this one answer said.
    void load();
    if (savedNow) {
      setEditing(null);
      showToast(tr('numbering.edit.savedNow'));
    }
  }, [load]);

  // The same header whether the screen opens or tells the person it is for administrators.
  const header = (
    <Stack.Screen
      options={{
        title: tr('numbering.screen.title'),
        headerShown: true,
        headerTitleAlign: 'center',
        headerLeft: () => <HeaderBackButton />,
      }}
    />
  );

  if (!allowed) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {header}
        <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
        <Icon name="account-lock-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.stateTitle} accessibilityRole="header">{tr('numbering.screen.adminsOnlyTitle')}</Text>
        <Text style={styles.stateMessage}>{tr('numbering.screen.adminsOnlyMessage')}</Text>
        <Button onPress={() => router.replace('/settings')}>{tr('numbering.screen.backToSettings')}</Button>
      </View>
    );
  }

  const editingRule = rules?.find(rule => rule.document_type === editing) ?? null;

  return (
    <View style={styles.screen}>
      {header}
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            // Pull to refresh reads the rules again; the spinner of the first load is the screen's own.
            refreshing={busy && rules !== null}
            onRefresh={() => void load()}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
            progressBackgroundColor={t.surface.card}
          />
        }
      >
        <Text style={styles.intro}>{tr('numbering.screen.intro')}</Text>
        {rules === null && busy ? (
          <ActivityIndicator style={styles.loading} color={t.brand.tint} accessibilityLabel={tr('common.loading')} />
        ) : null}
        {rules === null && !busy && error ? (
          <View style={styles.errorBox} testID="numbering-error">
            <Text style={styles.stateMessage} accessibilityRole="alert">{error}</Text>
            <Button type="secondary" onPress={() => void load()}>{tr('common.retry')}</Button>
          </View>
        ) : null}
        {rules ? (
          <SettingsSection title={tr('numbering.screen.title')} testID="numbering-rules">
            {rules.map((rule, index) => (
              <SettingsRow
                key={rule.document_type}
                testID={`numbering-row-${rule.document_type}`}
                icon={TYPE_ICON[rule.document_type]}
                label={tr(TYPE_LABEL[rule.document_type])}
                subtitle={describeRuleLines(rule).join('\n')}
                onPress={() => setEditing(rule.document_type)}
                last={index === rules.length - 1}
              />
            ))}
          </SettingsSection>
        ) : null}
        {rules && error ? <Text style={styles.staleNote}>{error}</Text> : null}
      </ScrollView>
      <NumberingEditSheet rule={editingRule} onClose={() => setEditing(null)} onSaved={saved} onRefreshed={refreshed} onUnconfirmed={() => void load()} />
    </View>
  );
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background.grouped },
    intro: { ...typography.footnote, color: t.text.secondary, marginHorizontal: layout.marginCompact, marginVertical: space.lg },
    loading: { marginTop: space.xxl },
    errorBox: { marginHorizontal: layout.marginCompact, gap: space.md, alignItems: 'center' },
    staleNote: { ...typography.footnote, color: t.status.negative.text, marginHorizontal: layout.marginCompact },
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
