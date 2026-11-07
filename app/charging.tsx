/**
 * Charging (Settings > Warehouse tools, administrators): how this facility counts storage time and rounds invoice
 * totals (backend migration 164, WH-137). Four choices, each row showing the value in use; the choices are staged and
 * "Save changes" asks before the server is told. Saved invoices keep the rule they were made with. The screen shows a
 * value only once the server has confirmed it. docs/STYLE_GUIDE.md §14.12 and §13.9.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Switch } from '@/components/ui/Switch';
import { SettingsRow, SettingsSection } from '@/features/settings/components/SettingsList';
import { PreferenceSheet, type PreferenceOption } from '@/features/settings/components/PreferenceSheet';
import {
  DAYS_CHOICES,
  DAYS_LABEL,
  MINIMUM_CHOICES,
  ROUNDING_CHOICES,
  ROUNDING_LABEL,
  STEP_CHOICES,
  STEP_LABEL,
  minimumAllowed,
  minimumLabel,
  sameChargingRule,
  describeChargingRule,
  type ChargingRule,
} from '@/features/charging/chargingRule';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, t as tr } from '@/i18n';
import { canOpenScreen } from '@/config/roles';
import { backendHasFeature } from '@/config/backendFeatures';
import {
  ChargingUnconfirmedError,
  PartialInvoicesOpenError,
  getChargingRule,
  setChargingRule,
  type StoredChargingRule,
} from '@/services/chargingRuleService';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { transportText } from '@/utils/serverText';
import { showAlert } from '@/utils/alert';

type SheetName = 'step' | 'minimum' | 'days' | 'round';

export default function ChargingScreen() {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const isFocused = useIsFocused();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const allowed = canOpenScreen(role, 'charging');
  const [stored, setStored] = useState<StoredChargingRule | null>(null);
  const [draft, setDraft] = useState<ChargingRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [asking, setAsking] = useState(false);
  const [askingLeave, setAskingLeave] = useState(false);
  // The latest read wins: an answer that arrives after a newer request is dropped.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBusy(true);
    setError(null);
    try {
      const next = await getChargingRule();
      if (request !== requestRef.current) return;
      setStored(next);
      setDraft(next.rule);
    } catch (failure) {
      if (request === requestRef.current) setError(transportText(failure) ?? tr('charging.screen.loadFailed'));
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

  const dirty = stored !== null && draft !== null && !sameChargingRule(stored.rule, draft);

  const choose = useCallback((change: Partial<ChargingRule>) => {
    setDraft(current => {
      if (!current) return current;
      const next = { ...current, ...change };
      // A minimum shorter than the step cannot stay: the step wins, so the minimum becomes the step's own length.
      if (!minimumAllowed(next.minimum_days, next.step_days)) next.minimum_days = next.step_days as ChargingRule['minimum_days'];
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setAsking(false);
    setSaving(true);
    try {
      const result = await setChargingRule(draft);
      setStored(result.stored);
      setDraft(result.stored.rule);
      showToast(tr(result.changed ? 'charging.screen.saved' : 'charging.screen.unchanged'));
    } catch (failure) {
      if (failure instanceof ChargingUnconfirmedError) {
        showAlert(tr('charging.screen.title'), failure.message);
        void load();
      } else {
        showAlert(tr('charging.screen.title'), failure instanceof Error ? failure.message : tr('charging.screen.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  // WH-138: the switch. It sends the rule the server holds (not the choices staged above) with the switch changed, and shows
  // the value only once the server has answered.
  const changeGoodsLeave = useCallback(
    async (on: boolean) => {
      if (!stored) return;
      setAskingLeave(false);
      setSaving(true);
      try {
        const result = await setChargingRule(stored.rule, on);
        setStored(result.stored);
        // Staged choices are the person's own; only a draft that equalled the old rule follows the stored one.
        setDraft(current => (current && sameChargingRule(current, stored.rule) ? result.stored.rule : current));
        showToast(tr(result.changed ? 'charging.screen.saved' : 'charging.screen.unchanged'));
      } catch (failure) {
        if (failure instanceof PartialInvoicesOpenError) {
          const numbers = failure.grNos.map(formatIdentifier).join(', ');
          showAlert(
            tr('charging.goodsLeave.label'),
            numbers ? `${failure.message}\n${tr('charging.goodsLeave.turnOffRefusedList', { numbers })}` : failure.message
          );
        } else if (failure instanceof ChargingUnconfirmedError) {
          showAlert(tr('charging.screen.title'), failure.message);
          void load();
        } else {
          showAlert(tr('charging.screen.title'), failure instanceof Error ? failure.message : tr('charging.goodsLeave.changeFailed'));
        }
      } finally {
        setSaving(false);
      }
    },
    [stored, load]
  );
  const showsGoodsLeave = backendHasFeature('invoiceAsGoodsLeave') && stored !== null && stored.invoiceAsGoodsLeave !== null;

  const header = (
    <Stack.Screen
      options={{
        title: tr('charging.screen.title'),
        headerShown: true,
        headerTitleAlign: 'center',
        headerLeft: () => <HeaderBackButton />,
      }}
    />
  );

  const options = useMemo((): Record<SheetName, PreferenceOption<string>[]> => {
    const step = draft?.step_days ?? 15;
    return {
      step: STEP_CHOICES.map(value => ({ value: String(value), label: tr(STEP_LABEL[value]) })),
      minimum: MINIMUM_CHOICES.map(value => {
        const ok = minimumAllowed(value, step);
        return { value: String(value), label: minimumLabel(value), disabled: !ok, hint: ok ? undefined : tr('charging.minimum.shorterThanStep') };
      }),
      days: DAYS_CHOICES.map(value => ({ value, label: tr(DAYS_LABEL[value]) })),
      round: ROUNDING_CHOICES.map(value => ({ value, label: tr(ROUNDING_LABEL[value]) })),
    };
    // The language is part of what the labels are made from.
  }, [draft?.step_days, tr('charging.screen.title')]);

  if (!allowed) {
    return (
      <View style={[styles.stateScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {header}
        <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
        <Icon name="account-lock-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.stateTitle} accessibilityRole="header">{tr('charging.screen.adminsOnlyTitle')}</Text>
        <Text style={styles.stateMessage}>{tr('charging.screen.adminsOnlyMessage')}</Text>
        <Button onPress={() => router.replace('/settings')}>{tr('charging.screen.backToSettings')}</Button>
      </View>
    );
  }

  const selectedOf = (name: SheetName): string => {
    if (!draft) return '';
    switch (name) {
      case 'step': return String(draft.step_days);
      case 'minimum': return String(draft.minimum_days);
      case 'days': return draft.days_counted;
      case 'round': return draft.rounding;
    }
  };
  const onSelect = (name: SheetName, value: string) => {
    if (name === 'step') choose({ step_days: Number(value) as ChargingRule['step_days'] });
    else if (name === 'minimum') choose({ minimum_days: Number(value) as ChargingRule['minimum_days'] });
    else if (name === 'days') choose({ days_counted: value as ChargingRule['days_counted'] });
    else choose({ rounding: value as ChargingRule['rounding'] });
  };
  const SHEET_TITLE: Record<SheetName, string> = {
    step: tr('charging.step.label'),
    minimum: tr('charging.minimum.label'),
    days: tr('charging.days.label'),
    round: tr('charging.round.label'),
  };

  return (
    <View style={styles.screen}>
      {header}
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={busy && stored !== null}
            onRefresh={() => void load()}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
            progressBackgroundColor={t.surface.card}
          />
        }
      >
        <Text style={styles.intro}>{tr('charging.screen.intro')}</Text>
        {stored === null && busy ? (
          <ActivityIndicator style={styles.loading} color={t.brand.tint} accessibilityLabel={tr('common.loading')} />
        ) : null}
        {stored === null && !busy && error ? (
          <View style={styles.errorBox} testID="charging-error">
            <Text style={styles.stateMessage} accessibilityRole="alert">{error}</Text>
            <Button type="secondary" onPress={() => void load()}>{tr('common.retry')}</Button>
          </View>
        ) : null}
        {draft ? (
          <>
            <SettingsSection title={tr('charging.screen.title')} testID="charging-rule" footer={describeChargingRule(draft)}>
              <SettingsRow testID="charging-row-step" label={tr('charging.step.label')} value={tr(STEP_LABEL[draft.step_days])} onPress={() => setSheet('step')} />
              <SettingsRow testID="charging-row-minimum" label={tr('charging.minimum.label')} value={minimumLabel(draft.minimum_days)} onPress={() => setSheet('minimum')} />
              <SettingsRow testID="charging-row-days" label={tr('charging.days.label')} value={tr(DAYS_LABEL[draft.days_counted])} onPress={() => setSheet('days')} />
              <SettingsRow testID="charging-row-round" label={tr('charging.round.label')} value={tr(ROUNDING_LABEL[draft.rounding])} onPress={() => setSheet('round')} last />
            </SettingsSection>
            {showsGoodsLeave ? (
              <View style={styles.switchBox}>
                <Switch
                  label={tr('charging.goodsLeave.label')}
                  helperText={tr('charging.goodsLeave.help')}
                  value={stored?.invoiceAsGoodsLeave === true}
                  disabled={saving}
                  onValueChange={on => (on ? setAskingLeave(true) : void changeGoodsLeave(false))}
                />
              </View>
            ) : null}
            {stored?.updatedByName ? (
              <Text style={styles.intro}>{tr('charging.screen.changedBy', { name: stored.updatedByName })}</Text>
            ) : null}
            <View style={styles.actions}>
              <Button testID="charging-save" disabled={!dirty || saving} loading={saving} onPress={() => setAsking(true)}>
                {tr('charging.screen.save')}
              </Button>
            </View>
          </>
        ) : null}
        {stored && error ? <Text style={styles.staleNote}>{error}</Text> : null}
      </ScrollView>
      {sheet ? (
        <PreferenceSheet
          visible
          title={SHEET_TITLE[sheet]}
          options={options[sheet]}
          selected={selectedOf(sheet)}
          onSelect={value => onSelect(sheet, value)}
          onClose={() => setSheet(null)}
          testID={`charging-sheet-${sheet}`}
        />
      ) : null}
      <ConfirmDialog
        visible={askingLeave}
        title={tr('charging.goodsLeave.turnOnTitle')}
        message={tr('charging.goodsLeave.turnOnBody')}
        confirmText={tr('charging.goodsLeave.turnOn')}
        cancelText={tr('common.cancel')}
        onConfirm={() => void changeGoodsLeave(true)}
        onCancel={() => setAskingLeave(false)}
      />
      <ConfirmDialog
        visible={asking}
        title={tr('charging.confirm.title')}
        message={tr('charging.confirm.body')}
        confirmText={tr('charging.confirm.change')}
        cancelText={tr('common.cancel')}
        onConfirm={() => void save()}
        onCancel={() => setAsking(false)}
      />
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
    actions: { marginHorizontal: layout.marginCompact, marginTop: space.md },
    switchBox: { marginHorizontal: layout.marginCompact, marginTop: space.lg, borderRadius: radius.card, overflow: 'hidden', backgroundColor: t.surface.card },
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
