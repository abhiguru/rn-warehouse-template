/**
 * Connection history (Settings > Warehouse tools, administrators; WH-177, backend migration 188): the last 30 days, one row per
 * day, newest first: how many times phones could reach the server neither over the internet nor over the warehouse network, the
 * longest and total time, how many phones had a gap, and the saves tried and answers lost during gaps. A day without any says
 * "No gaps". docs/STYLE_GUIDE.md §14.12 and §13.9.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { SettingsSection } from '@/features/settings/components/SettingsList';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { canOpenScreen } from '@/config/roles';
import { getConnectionHistory, type ConnectionDay } from '@/services/connectionHistoryService';
import { formatDate, formatNumber } from '@/utils/formatters';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { transportText } from '@/utils/serverText';

/** Seconds as "1 h 5 min", "4 min 10 s" or "30 s", in the language's digits. */
export function durationText(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return tr('connectionHistory.hours', { hours: formatNumber(hours), minutes: formatNumber(minutes) });
  if (minutes > 0) return tr('connectionHistory.minutes', { minutes: formatNumber(minutes), seconds: formatNumber(seconds) });
  return tr('connectionHistory.seconds', { seconds: formatNumber(seconds) });
}

/** A day with no gap, no save tried and no answer lost is "No gaps". */
const isClean = (day: ConnectionDay): boolean => day.gaps === 0 && day.savesTried === 0 && day.lostAnswers === 0;

export default function ConnectionHistoryScreen() {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const isFocused = useIsFocused();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const allowed = canOpenScreen(role, 'connectionHistory');
  const [days, setDays] = useState<ConnectionDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  // The latest read wins.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBusy(true);
    setError(null);
    try {
      const next = await getConnectionHistory();
      if (request === requestRef.current) setDays(next);
    } catch (failure) {
      if (request === requestRef.current) setError(transportText(failure) ?? (failure instanceof Error ? failure.message : tr('connectionHistory.loadFailed')));
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
      options={{
        headerShown: true,
        title: tr('connectionHistory.title'),
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
        <Text style={styles.stateTitle} accessibilityRole="header">{tr('connectionHistory.adminsOnlyTitle')}</Text>
        <Text style={styles.stateMessage}>{tr('connectionHistory.adminsOnlyMessage')}</Text>
        <Button onPress={() => router.replace('/settings')}>{tr('connectionHistory.backToSettings')}</Button>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={busy && days !== null}
            onRefresh={() => void load()}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
            progressBackgroundColor={t.surface.card}
          />
        }
      >
        <Text style={styles.intro}>{tr('connectionHistory.intro')}</Text>
        {days === null && busy ? (
          <ActivityIndicator style={styles.loading} color={t.brand.tint} accessibilityLabel={tr('common.loading')} />
        ) : null}
        {days === null && !busy && error ? (
          <View style={styles.errorBox} testID="connection-history-error">
            <Text style={styles.stateMessage} accessibilityRole="alert">{error}</Text>
            <Button type="secondary" onPress={() => void load()}>{tr('common.retry')}</Button>
          </View>
        ) : null}
        {days ? (
          <SettingsSection title={tr('connectionHistory.title')} testID="connection-history-days">
            {days.map((day, index) => (
              <View
                key={day.day}
                style={[styles.dayRow, index < days.length - 1 && styles.dayRowDivider]}
                testID={`connection-day-${day.day}`}
                accessible
              >
                <Text style={styles.dayTitle}>{formatDate(day.day)}</Text>
                {isClean(day) ? (
                  <Text style={styles.dayLine}>{tr('connectionHistory.noGaps')}</Text>
                ) : (
                  <>
                    <Text style={styles.dayLine}>
                      {tr('connectionHistory.summaryGaps', {
                        count: formatNumber(day.gaps),
                        longest: durationText(day.longestS),
                        total: durationText(day.totalS),
                      })}
                    </Text>
                    <Text style={styles.dayLine}>
                      {tr('connectionHistory.summaryPhones', {
                        count: formatNumber(day.phones),
                        saves: formatNumber(day.savesTried),
                        lost: formatNumber(day.lostAnswers),
                      })}
                    </Text>
                  </>
                )}
              </View>
            ))}
          </SettingsSection>
        ) : null}
        {days && error ? <Text style={styles.staleNote}>{error}</Text> : null}
      </ScrollView>
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
    dayRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.xs, borderRadius: radius.card },
    dayRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border.divider },
    dayTitle: { ...typography.headline, color: t.text.primary },
    dayLine: { ...typography.body, color: t.text.secondary },
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
