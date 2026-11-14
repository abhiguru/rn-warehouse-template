/**
 * Accountant export (Settings > Warehouse tools, administrators; WH-158, backend migration 203): the ledger names the
 * accountant pack uses, the names the accountant has in Tally. 13 fields in the contract's order, each at most 60 characters;
 * an empty one is refused here before anything is sent, and the server checks again. Until an administrator saves once the
 * server's defaults are shown. The screen shows what the server confirmed. docs/STYLE_GUIDE.md §14.12 and §13.9.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Stack, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, type TranslationKey } from '@/i18n';
import { LEDGER_KEYS, getAccountantLedgers, setAccountantLedgers, type LedgerKey, type LedgerNames } from '@/services/accountantExportService';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showToast } from '@/utils/toast';

const NAME_MAX = 60;

/**
 * One ledger name field. The test identifier sits on this one element (not on the native input inside it), so a field is
 * found once; the label is the input's accessible name.
 */
function LedgerField(props: { testID: string; label: string; value: string; onChangeText: (text: string) => void; maxLength: number; error?: string; editable: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { testID: _testID, label, ...input } = props;
  return (
    <View>
      <Text style={[styles.label, input.error ? styles.labelError : null]}>{label}</Text>
      <Input {...input} accessibilityLabel={label} autoCorrect={false} />
    </View>
  );
}

type FieldErrors = Partial<Record<LedgerKey, string>>;

const labelOf = (key: LedgerKey) => tr(`settings.accountantExport.fields.${key}` as TranslationKey);

/** What the form can see is wrong before anything is sent: an empty name. */
function check(names: LedgerNames): FieldErrors {
  const errors: FieldErrors = {};
  for (const key of LEDGER_KEYS) {
    if (!names[key].trim()) errors[key] = tr('validation.required', { field: labelOf(key) });
  }
  return errors;
}

const sameNames = (a: LedgerNames, b: LedgerNames) => LEDGER_KEYS.every(key => a[key].trim() === b[key].trim());

export default function AccountantExportScreen() {
  const isFocused = useIsFocused();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [stored, setStored] = useState<LedgerNames | null>(null);
  const [draft, setDraft] = useState<LedgerNames | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  // The latest read wins: an answer that arrives after a newer request is dropped.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBusy(true);
    setLoadError(null);
    const result = await getAccountantLedgers();
    if (request !== requestRef.current) return;
    if (result.success) {
      setStored(result.data.ledgers);
      setDraft(result.data.ledgers);
    } else {
      setLoadError(result.message);
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!isFocused) return undefined;
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [isFocused, load]);

  const dirty = stored !== null && draft !== null && !sameNames(stored, draft);

  const change = (key: LedgerKey, value: string) => {
    setDraft(current => (current ? { ...current, [key]: value } : current));
    setFieldErrors(current => (current[key] ? { ...current, [key]: undefined } : current));
    setSaveError(null);
  };

  const save = async () => {
    if (!draft || savingRef.current) return;
    const errors = check(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await setAccountantLedgers(draft);
      if (result.success) {
        setStored(result.data.ledgers);
        setDraft(result.data.ledgers);
        showToast(tr(result.data.changed === false ? 'settings.accountantExport.unchanged' : 'settings.accountantExport.saved'));
      } else {
        // The typed names stay; the field the server names is marked.
        setSaveError(result.message);
        if (result.field) setFieldErrors({ [result.field]: result.message });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: tr('settings.accountantExport.title'),
          headerShown: true,
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
      >
        <Text style={styles.intro}>{tr('settings.accountantExport.help')}</Text>
        {stored === null && busy ? (
          <ActivityIndicator style={styles.loading} color={t.brand.tint} accessibilityLabel={tr('common.loading')} />
        ) : null}
        {stored === null && !busy && loadError ? (
          <View style={styles.errorBox} testID="accountant-export-load-error">
            <Text style={styles.stateMessage} accessibilityRole="alert">{loadError}</Text>
            <Button type="secondary" onPress={() => void load()}>{tr('common.retry')}</Button>
          </View>
        ) : null}
        {stored && draft ? (
          <>
            <View style={styles.fields}>
              {LEDGER_KEYS.map(key => (
                <LedgerField
                  key={key}
                  label={labelOf(key)}
                  value={draft[key]}
                  onChangeText={text => change(key, text)}
                  maxLength={NAME_MAX}
                  error={fieldErrors[key]}
                  editable={!saving}
                  testID={`accountant-export-${key}`}
                />
              ))}
            </View>
            {saveError ? (
              <Text style={styles.saveError} testID="accountant-export-error" accessibilityLiveRegion="polite" accessibilityRole="alert">
                {saveError}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button testID="accountant-export-save" disabled={!dirty || saving} loading={saving} onPress={() => void save()}>
                {tr('common.save')}
              </Button>
            </View>
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background.grouped },
    intro: { ...typography.footnote, color: t.text.secondary, marginHorizontal: layout.marginCompact, marginVertical: space.lg },
    label: { ...typography.footnote, color: t.text.secondary, marginBottom: space.xs },
    labelError: { color: t.status.negative.text },
    loading: { marginTop: space.xxl },
    errorBox: { marginHorizontal: layout.marginCompact, gap: space.md, alignItems: 'center' },
    fields: { marginHorizontal: layout.marginCompact, gap: space.md },
    saveError: { ...typography.subhead, color: t.status.negative.text, marginHorizontal: layout.marginCompact, marginTop: space.md },
    actions: { marginHorizontal: layout.marginCompact, marginTop: space.md },
    stateMessage: { ...typography.body, color: t.text.secondary, textAlign: 'center' },
  });
