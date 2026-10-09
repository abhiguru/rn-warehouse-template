import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
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
import { logout } from '@/store/slices/authSlice';
import { clearSessionScopedState } from '@/store/sessionScopedState';
import ConfigService from '@/services/configService';
import { queryClient } from '@/lib/queryClient';
import { beginOperatorSwitch, clearPendingEnrollment, endOperatorSwitch, getPendingEnrollmentToken, signOutPendingEnrollment } from '@/config/supabaseConfig';
import { commitStagedOperatorServer, discoverOperator, getActiveOperatorServer, parseOperatorOrigin, stageOperatorServer } from '@/config/operatorServer';

import { showAlert } from '@/utils/alert';
type Discovery = Awaited<ReturnType<typeof discoverOperator>>;

export interface OperatorServerSelectionProps {
  /** Rendered by the bootstrap screen rather than pushed as a route. */
  initial?: boolean;
  /**
   * Leave without changing anything. Shown as a Back button; also called when
   * the operator re-selects the already active server while `initial`.
   */
  onCancel?: () => void;
}

export function OperatorServerSelection({ initial = false, onCancel }: OperatorServerSelectionProps) {
  const dispatch = useAppDispatch();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
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
      showAlert('Server unavailable', error instanceof Error ? error.message : "Couldn't check this server. Check the address and try again.");
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
    if (queryClient.isMutating() > 0) {
      showAlert('Operation in progress', 'Finish the current operation before switching servers.');
      return;
    }
    if (!beginOperatorSwitch()) {
      showAlert('Operation in progress', 'Finish the current operation before switching servers.');
      return;
    }
    activating.current = true;
    setBusy(true);
    let sessionCleared = false;
    try {
      const previous = getActiveOperatorServer();
      if (previous?.origin === selected.server.origin && previous.instanceId === selected.server.instanceId) {
        // Same server: nothing changes, so leave the way the caller expects.
        if (initial) onCancel?.();
        else router.back();
        return;
      }
      await stageOperatorServer(selected.server);
      sessionCleared = true;
      const replacedAtSameOrigin = previous?.origin === selected.server.origin && previous.instanceId !== selected.server.instanceId;
      await dispatch(logout(replacedAtSameOrigin ? { localOnly: true } : undefined)).unwrap();
      if (await getPendingEnrollmentToken()) {
        if (previous && !replacedAtSameOrigin) await signOutPendingEnrollment();
        else await clearPendingEnrollment();
      }
      await clearSessionScopedState(dispatch);
      await ConfigService.clearCache();
      await commitStagedOperatorServer(selected.server);
      if (!initial) router.replace('/login');
    } catch {
      showAlert("Couldn't change server", sessionCleared
        ? 'The old session was cleared. Check the selected server and sign in again.'
        : 'The current server was kept. Try again.');
    } finally { endOperatorSwitch(); activating.current = false; setBusy(false); }
  };

  const chooseServer = () => {
    if (!candidate || busy || activating.current) return;
    const selected = candidate;
    const request = inspection.current;
    const previous = getActiveOperatorServer();
    if (previous && (previous.origin !== selected.server.origin || previous.instanceId !== selected.server.instanceId)) {
      showAlert(
        'Change warehouse server?',
        `Changing to ${selected.server.displayName} will sign you out and discard unsaved forms. You will need to sign in again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change server', style: 'destructive', onPress: () => { void activate(selected, request); } },
        ]
      );
      return;
    }
    void activate(selected, request);
  };

  const fieldStyle = [styles.input, focused && styles.inputFocused];

  return <SafeAreaView style={styles.screen}>
    {initial && <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />}
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text style={styles.title} accessibilityRole="header">Choose your warehouse server</Text>
          <Text style={styles.help}>Enter the server address your facility gave you, or scan its QR code.</Text>

          <View style={styles.field}>
            <Text style={styles.label} nativeID="server-origin-label">Server address</Text>
            <TextInput value={origin} onChangeText={value => { if (activating.current) return; inspection.current += 1; setBusy(false); setOrigin(value); setCandidate(null); }}
              autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://warehouse.example.com"
              placeholderTextColor={t.text.placeholder} textContentType="URL" autoComplete="url" returnKeyType="go"
              onSubmitEditing={() => { if (!busy) void inspect(origin); }}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              style={fieldStyle} accessibilityLabel="Server origin" accessibilityLabelledBy="server-origin-label" />
          </View>

          <View style={styles.actions}>
            <Button type={candidate ? 'secondary' : 'primary'} size="fullWidth" onPress={() => void inspect(origin)} disabled={busy}>Check server</Button>
            <Button type="secondary" size="fullWidth" onPress={() => void scan()} disabled={busy}>Scan QR code</Button>
            {onCancel && <Button type="secondary" variant="normal" size="fullWidth" onPress={onCancel} disabled={busy}>Back</Button>}
          </View>

          {busy && <View style={styles.busy}>
            <ActivityIndicator color={t.brand.tint} />
            <Text style={styles.busyText}>Checking server</Text>
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
            <Button size="fullWidth" onPress={chooseServer} disabled={busy}>Use this server</Button>
          </View>}
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
            catch { showAlert('Invalid QR code', 'Scan a QR code containing only an HTTPS server origin.'); }
          }} />
        <Text style={styles.cameraHint}>Point the camera at the server QR code.</Text>
        <Button type="secondary" variant="normal" size="fullWidth" onPress={() => setScanning(false)} style={styles.cameraCancel} textStyle={styles.cameraCancelText}>Cancel</Button>
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
