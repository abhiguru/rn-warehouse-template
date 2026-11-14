/**
 * GST details (Settings > Warehouse tools, administrators; WH-151, backend migration 173): the warehouse's GSTIN (the state is its
 * first two digits), the address and legal name printed on bills, and the SAC codes for storage and labour. Until an administrator saves, no new bill can be made (WH-205; the Home strip asks for
 * the details). Saving asks first; saved bills keep the details they were made with. The screen shows what the server
 * confirmed. docs/STYLE_GUIDE.md §14.12 and §13.9.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, Stack, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { canOpenScreen } from '@/config/roles';
import { GstUnconfirmedError, getGstDetails, setGstDetails, type GstDetails, type GstDetailsInput } from '@/services/gstService';
import { stateNameOf } from '@/features/gst/indianStates';
import { invalidateGstSaved } from '@/features/gst/useGstSaved';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showToast } from '@/utils/toast';
import { showAlert } from '@/utils/alert';
import { transportText } from '@/utils/serverText';

/** The shape of a GSTIN (the same check the customer form makes). The server checks it again and decides. */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const SAC_SHAPE = /^[0-9]{4,8}$/;
const ADDRESS_MAX = 300;
const GSTIN_EXAMPLE = '24AAAAA0000A1Z5';

type Errors = Partial<Record<'gstin' | 'address' | 'sacStorage' | 'sacLabour', string>>;

const toDraft = (details: GstDetails): GstDetailsInput => ({
  gstin: details.gstin,
  address: details.address,
  legalName: details.legalName,
  sacStorage: details.sacStorage,
  sacLabour: details.sacLabour,
});

const sameDraft = (a: GstDetailsInput, b: GstDetailsInput): boolean =>
  a.gstin.trim() === b.gstin.trim() &&
  a.address.trim() === b.address.trim() &&
  a.legalName.trim() === b.legalName.trim() &&
  a.sacStorage.trim() === b.sacStorage.trim() &&
  a.sacLabour.trim() === b.sacLabour.trim();

/** What the form can see is wrong before anything is sent (the server's refusal of the same things is worded as one text). */
function check(draft: GstDetailsInput): Errors {
  const errors: Errors = {};
  const gstin = draft.gstin.trim().toUpperCase();
  if (!gstin) errors.gstin = tr('gst.settings.gstinRequired');
  else if (!GSTIN_SHAPE.test(gstin)) errors.gstin = tr('gst.settings.invalidGstin', { example: GSTIN_EXAMPLE });
  const address = draft.address.trim();
  if (!address) errors.address = tr('gst.settings.addressRequired');
  else if (address.length > ADDRESS_MAX) errors.address = tr('gst.settings.addressTooLong', { max: ADDRESS_MAX });
  // A SAC may be left empty: the server then uses 996721 (storage) and 996719 (labour).
  if (draft.sacStorage.trim() && !SAC_SHAPE.test(draft.sacStorage.trim())) errors.sacStorage = tr('gst.settings.invalidSac');
  if (draft.sacLabour.trim() && !SAC_SHAPE.test(draft.sacLabour.trim())) errors.sacLabour = tr('gst.settings.invalidSac');
  return errors;
}

export default function GstDetailsScreen() {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const isFocused = useIsFocused();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const allowed = canOpenScreen(role, 'gstDetails');
  const [stored, setStored] = useState<GstDetails | null>(null);
  const [draft, setDraft] = useState<GstDetailsInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // The latest read wins: an answer that arrives after a newer request is dropped.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBusy(true);
    setError(null);
    try {
      const next = await getGstDetails();
      if (request !== requestRef.current) return;
      setStored(next);
      setDraft(toDraft(next));
    } catch (failure) {
      if (request === requestRef.current) setError(transportText(failure) ?? (failure instanceof Error && failure.message ? failure.message : tr('gst.settings.loadFailed')));
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

  const errors = draft && showErrors ? check(draft) : {};
  const dirty = stored !== null && draft !== null && (!stored.saved || !sameDraft(toDraft(stored), draft));

  const change = (patch: Partial<GstDetailsInput>) => setDraft(current => (current ? { ...current, ...patch } : current));

  const ask = () => {
    if (!draft) return;
    setShowErrors(true);
    if (Object.keys(check(draft)).length > 0) return;
    setAsking(true);
  };

  const save = useCallback(async () => {
    if (!draft) return;
    setAsking(false);
    setSaving(true);
    try {
      const next = await setGstDetails(draft);
      setStored(next);
      setDraft(toDraft(next));
      setShowErrors(false);
      invalidateGstSaved();
      showToast(tr('gst.settings.saved'));
    } catch (failure) {
      if (failure instanceof GstUnconfirmedError) {
        showAlert(tr('gst.settings.title'), failure.message);
        void load();
      } else {
        showAlert(tr('gst.settings.title'), failure instanceof Error ? failure.message : tr('gst.settings.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const header = (
    <Stack.Screen
      options={{
        title: tr('gst.settings.title'),
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
        <Text style={styles.stateTitle} accessibilityRole="header">{tr('gst.settings.adminsOnlyTitle')}</Text>
        <Text style={styles.stateMessage}>{tr('gst.settings.adminsOnlyMessage')}</Text>
        <Button onPress={() => router.replace('/settings')}>{tr('gst.settings.backToSettings')}</Button>
      </View>
    );
  }

  const gstinState = draft && GSTIN_SHAPE.test(draft.gstin.trim().toUpperCase()) ? stateNameOf(draft.gstin.trim().slice(0, 2)) : '';

  return (
    <View style={styles.screen}>
      {header}
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
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
        <Text style={styles.intro}>{tr('gst.settings.intro')}</Text>
        {stored === null && busy ? (
          <ActivityIndicator style={styles.loading} color={t.brand.tint} accessibilityLabel={tr('common.loading')} />
        ) : null}
        {stored === null && !busy && error ? (
          <View style={styles.errorBox} testID="gst-details-error">
            <Text style={styles.stateMessage} accessibilityRole="alert">{error}</Text>
            <Button type="secondary" onPress={() => void load()}>{tr('common.retry')}</Button>
          </View>
        ) : null}
        {stored && draft ? (
          <>
            {!stored.saved || !stored.registered ? <Text style={styles.note} testID="gst-details-not-saved">{tr('gst.settings.notSavedNote')}</Text> : null}
            <View style={styles.fields}>
                <>
                  <Input
                    label={tr('gst.settings.gstin')}
                    required
                    identifier
                    value={draft.gstin}
                    onChangeText={text => change({ gstin: text.toUpperCase().replace(/\s/g, '') })}
                    maxLength={15}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    helperText={tr('gst.settings.gstinHelp', { example: GSTIN_EXAMPLE })}
                    error={errors.gstin}
                    editable={!saving}
                    testID="gst-details-gstin"
                  />
                  {gstinState ? (
                    <Input
                      label={tr('gst.settings.state')}
                      value={gstinState}
                      readOnly
                      onChangeText={() => undefined}
                      helperText={tr('gst.settings.stateFromGstin')}
                      testID="gst-details-state"
                    />
                  ) : null}
                </>
              <Input
                label={tr('gst.settings.address')}
                required
                value={draft.address}
                onChangeText={text => change({ address: text })}
                maxLength={ADDRESS_MAX}
                multiline
                numberOfLines={3}
                helperText={tr('gst.settings.addressHelp')}
                error={errors.address}
                editable={!saving}
                testID="gst-details-address"
              />
              <Input
                label={tr('gst.settings.legalName')}
                value={draft.legalName}
                onChangeText={text => change({ legalName: text })}
                maxLength={120}
                editable={!saving}
                testID="gst-details-legal-name"
              />
                <>
                  <Input
                    label={tr('gst.settings.sacStorage')}
                    identifier
                    value={draft.sacStorage}
                    onChangeText={text => change({ sacStorage: text.replace(/\D/g, '') })}
                    keyboardType="number-pad"
                    maxLength={8}
                    helperText={tr('gst.settings.sacHelp')}
                    error={errors.sacStorage}
                    editable={!saving}
                    testID="gst-details-sac-storage"
                  />
                  <Input
                    label={tr('gst.settings.sacLabour')}
                    identifier
                    value={draft.sacLabour}
                    onChangeText={text => change({ sacLabour: text.replace(/\D/g, '') })}
                    keyboardType="number-pad"
                    maxLength={8}
                    error={errors.sacLabour}
                    editable={!saving}
                    testID="gst-details-sac-labour"
                  />
                </>
            </View>
            {stored.savedByName ? <Text style={styles.intro}>{tr('gst.settings.savedBy', { name: stored.savedByName })}</Text> : null}
            <View style={styles.actions}>
              <Button testID="gst-details-save" disabled={!dirty || saving} loading={saving} onPress={ask}>
                {tr('gst.settings.save')}
              </Button>
            </View>
          </>
        ) : null}
        {stored && error ? <Text style={styles.staleNote}>{error}</Text> : null}
      </KeyboardAwareScrollView>
      <ConfirmDialog
        visible={asking}
        title={tr('gst.settings.confirmTitle')}
        message={tr('gst.settings.confirmBody')}
        confirmText={tr('gst.settings.confirm')}
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
    note: { ...typography.footnote, color: t.text.secondary, marginHorizontal: layout.marginCompact, marginBottom: space.md },
    loading: { marginTop: space.xxl },
    errorBox: { marginHorizontal: layout.marginCompact, gap: space.md, alignItems: 'center' },
    staleNote: { ...typography.footnote, color: t.status.negative.text, marginHorizontal: layout.marginCompact },
    actions: { marginHorizontal: layout.marginCompact, marginTop: space.md },
    fields: { marginHorizontal: layout.marginCompact, marginTop: space.lg, gap: space.md },
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
