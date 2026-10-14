import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { useAppDispatch } from '@/store/hooks';
import { switchOperatorServer } from '@/store/operatorSwitch';
import { discoverOperator, getActiveOperatorServer, parseOperatorOrigin } from '@/config/operatorServer';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
import { useAppLanguage } from '@/i18n/useAppLanguage';
import { LanguageSwitch } from '@/components/LanguageSwitch';
type Discovery = Awaited<ReturnType<typeof discoverOperator>>;

export interface OperatorServerSelectionProps {
  /** Rendered by the bootstrap screen rather than pushed as a route. */
  initial?: boolean;
  /**
   * Leave without changing anything. Shown as a Back button; also called when
   * the operator re-selects the already active server while `initial`.
   */
  onCancel?: () => void;
  /**
   * Central login ("Enter address" under Add facility): hand the checked
   * server to the caller instead of switching to it here. The caller adds it
   * to "My facilities" and opens it; nothing is signed out on this screen.
   */
  onChoose?: (discovery: Discovery) => void;
  /**
   * The server in use, when this is "Change warehouse server" inside Settings: shown in a
   * read-only card above the field, and the screen's own title is left to the header.
   */
  current?: Discovery['server'] | null;
  /** Leave out the language switch (Settings has "Language on this phone"). */
  hideLanguage?: boolean;
  /** A header above this screen already covers the top of the safe area. */
  underHeader?: boolean;
}

export function OperatorServerSelection({
  initial = false,
  onCancel,
  onChoose,
  current = null,
  hideLanguage = false,
  underHeader = false,
}: OperatorServerSelectionProps) {
  const dispatch = useAppDispatch();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  // Shown before the app shell exists (app/_layout.tsx), so this screen follows the language itself.
  useAppLanguage();
  const [focused, setFocused] = useState(false);
  const [origin, setOrigin] = useState('');
  const [candidate, setCandidate] = useState<Discovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const inspection = useRef(0);
  const scanLocked = useRef(false);
  const activating = useRef(false);

  useEffect(() => () => { inspection.current += 1; }, []);

  const inspect = async (value: string) => {
    if (activating.current) return;
    // The result card arrives below the field: close the keyboard so it is not behind it.
    // Every start of a check comes through here (button, the field's submit key, a scanned code).
    Keyboard.dismiss();
    const request = ++inspection.current;
    setBusy(true);
    setCandidate(null);
    try {
      const discovered = await discoverOperator(value);
      if (request !== inspection.current) return;
      setOrigin(discovered.server.origin);
      setCandidate(discovered);
    } catch (error) {
      if (request !== inspection.current) return;
      // The app's own texts (discoverOperator throws them as plain Errors) are shown as they are;
      // a network failure (TypeError) or a reply that is not JSON (SyntaxError) is not for the person to read.
      const own = error instanceof Error && !(error instanceof TypeError) && !(error instanceof SyntaxError);
      showAlert(tr('auth.server.unavailableTitle'), own ? error.message : tr('auth.server.couldNotCheck'));
    } finally { if (request === inspection.current) setBusy(false); }
  };

  const scan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    scanLocked.current = false;
    setScanning(true);
  };

  const activate = async (selected: Discovery, request: number) => {
    // A confirmation belongs to one discovery result. Editing the origin or
    // leaving this screen invalidates its callback before any session change.
    if (request !== inspection.current || busy || activating.current) return;
    // The sequence itself is shared with central login (src/store/operatorSwitch.ts).
    const outcome = await switchOperatorServer(selected.server, dispatch, {
      onBegin: () => { activating.current = true; setBusy(true); },
      // Same server: nothing changes, so leave the way the caller expects.
      onSame: () => { if (initial) onCancel?.(); else router.back(); },
      onCommitted: () => { if (!initial) router.replace('/login'); },
      onEnd: () => { activating.current = false; setBusy(false); },
    });
    if (outcome.kind === 'busy') showAlert(tr('auth.server.busyTitle'), tr('auth.server.busyMessage'));
    else if (outcome.kind === 'failed') {
      showAlert(tr('auth.server.couldNotChangeTitle'), outcome.sessionCleared
        ? tr('auth.server.sessionClearedMessage')
        : tr('auth.server.serverKeptMessage'));
    }
  };

  const chooseServer = () => {
    if (!candidate || busy || activating.current) return;
    const selected = candidate;
    if (onChoose) {
      onChoose(selected);
      return;
    }
    const request = inspection.current;
    const previous = getActiveOperatorServer();
    if (previous && (previous.origin !== selected.server.origin || previous.instanceId !== selected.server.instanceId)) {
      showAlert(
        tr('auth.server.confirmTitle'),
        tr('auth.server.confirmMessage', { name: selected.server.displayName }),
        [
          { text: tr('common.cancel'), style: 'cancel' },
          { text: tr('auth.server.confirmAction'), style: 'destructive', onPress: () => { void activate(selected, request); } },
        ]
      );
      return;
    }
    void activate(selected, request);
  };

  const fieldStyle = [styles.input, focused && styles.inputFocused];

  return <SafeAreaView style={styles.screen} edges={underHeader ? ['bottom', 'left', 'right'] : undefined}>
    {initial && <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />}
    {/* Same as the sign-in screens (PhoneSignInForm, CodeEntryForm): padding on iOS, height on Android. */}
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {!current && <Text style={styles.title} accessibilityRole="header">{tr('auth.server.title')}</Text>}
          <Text style={styles.help}>{current ? tr('settings.server.help') : tr('auth.server.help')}</Text>

          {current && <View style={styles.card} testID="server-in-use">
            <Text style={styles.inUse}>{tr('settings.server.inUse')}</Text>
            <View style={styles.cell} accessible accessibilityLabel={`${tr('settings.server.inUse')}, ${current.displayName}, ${current.companyName}, ${current.origin}`}>
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="office-building-outline" size={iconSize.lg} color={t.brand.tint} />
              </View>
              <View style={styles.cellText}>
                <Text style={styles.name} numberOfLines={2}>{current.displayName}</Text>
                <Text style={styles.company}>{current.companyName}</Text>
                <Text style={styles.originText}>{current.origin}</Text>
              </View>
            </View>
          </View>}

          <View style={styles.field}>
            <Text style={styles.label} nativeID="server-origin-label">{tr('auth.server.addressLabel')}</Text>
            <TextInput value={origin} onChangeText={value => { if (activating.current) return; inspection.current += 1; setBusy(false); setOrigin(value); setCandidate(null); }}
              autoCapitalize="none" autoCorrect={false} keyboardType="url"
              textContentType="URL" autoComplete="url" returnKeyType="go"
              onSubmitEditing={() => { if (!busy) void inspect(origin); }}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              style={fieldStyle} accessibilityLabel={tr('auth.server.addressLabel')} accessibilityLabelledBy="server-origin-label" />
          </View>

          <View style={styles.actions}>
            <Button type={candidate ? 'secondary' : 'primary'} size="fullWidth" onPress={() => void inspect(origin)} disabled={busy}>{tr('auth.server.check')}</Button>
            <Button type="secondary" size="fullWidth" onPress={() => void scan()} disabled={busy}>{tr('auth.server.scan')}</Button>
            {onCancel && <Button type="secondary" variant="normal" size="fullWidth" onPress={onCancel} disabled={busy}>{tr('common.back')}</Button>}
          </View>

          {busy && <View style={styles.busy}>
            <ActivityIndicator color={t.brand.tint} />
            <Text style={styles.busyText}>{tr('auth.server.checking')}</Text>
          </View>}

          {candidate && <View style={styles.card}>
            <View style={styles.cell} accessible accessibilityLabel={`${candidate.server.displayName}, ${candidate.server.companyName}, ${candidate.server.origin}`}>
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="office-building-outline" size={iconSize.lg} color={t.brand.tint} />
              </View>
              <View style={styles.cellText}>
                <Text style={styles.name} numberOfLines={2}>{candidate.server.displayName}</Text>
                <Text style={styles.company}>{candidate.server.companyName}</Text>
                <Text style={styles.originText}>{candidate.server.origin}</Text>
              </View>
            </View>
            <Button size="fullWidth" onPress={chooseServer} disabled={busy}>{tr('auth.server.use')}</Button>
          </View>}

          {/* English or Gujarati, below the actions so it never pushes them down */}
          {!hideLanguage && <LanguageSwitch />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
      <SafeAreaView style={styles.cameraContainer}>
        <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (scanLocked.current) return;
            scanLocked.current = true;
            setScanning(false);
            try { void inspect(parseOperatorOrigin(data)); }
            catch { showAlert(tr('auth.server.invalidQrTitle'), tr('auth.server.invalidQrMessage')); }
          }} />
        <Text style={styles.cameraHint}>{tr('auth.server.cameraHint')}</Text>
        <Button type="secondary" variant="normal" size="fullWidth" onPress={() => setScanning(false)} style={styles.cameraCancel} textStyle={styles.cameraCancelText}>{tr('common.cancel')}</Button>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.xxxl,
  },
  column: { width: '100%' as const, maxWidth: layout.maxFormWidth, gap: space.lg },
  title: { ...typography.title2, color: t.text.primary },
  help: { ...typography.body, color: t.text.secondary },
  field: { gap: space.xs },
  label: { ...typography.footnote, color: t.text.secondary },
  input: {
    ...typography.body,
    color: t.text.primary,
    backgroundColor: t.surface.field,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  inputFocused: { borderWidth: 2, borderColor: t.border.fieldFocus, paddingHorizontal: space.md - 1 },
  actions: { gap: space.sm },
  busy: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: space.sm },
  busyText: { ...typography.subhead, color: t.text.secondary },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.lg,
    ...t.shadow[2],
  },
  cell: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md },
  avatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cellText: { flex: 1, gap: space.xxs },
  inUse: { ...typography.footnote, color: t.text.secondary },
  name: { ...typography.headline, color: t.text.primary },
  company: { ...typography.subhead, color: t.text.secondary },
  originText: { ...typography.footnote, fontWeight: fontWeight.regular, color: t.text.secondary },
  // Camera viewfinder: the photo backdrop is the one place pure black is allowed.
  cameraContainer: { flex: 1, gap: space.lg, padding: space.lg, backgroundColor: t.overlay.imageBackdrop },
  camera: { flex: 1, borderRadius: radius.card, overflow: 'hidden' as const },
  cameraHint: { ...typography.subhead, color: t.overlay.onImage, textAlign: 'center' as const },
  cameraCancel: { borderColor: t.overlay.onImage },
  cameraCancelText: { color: t.overlay.onImage },
});
