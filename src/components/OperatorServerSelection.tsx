import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { clearSessionScopedState } from '@/store/sessionScopedState';
import ConfigService from '@/services/configService';
import { queryClient } from '@/lib/queryClient';
import { beginOperatorSwitch, clearPendingEnrollment, endOperatorSwitch, getPendingEnrollmentToken, signOutPendingEnrollment } from '@/config/supabaseConfig';
import { commitStagedOperatorServer, discoverOperator, getActiveOperatorServer, parseOperatorOrigin, stageOperatorServer } from '@/config/operatorServer';

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
      Alert.alert('Server Unavailable', error instanceof Error ? error.message : 'Could not inspect this server.');
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
      Alert.alert('Operation In Progress', 'Finish the current operation before switching servers.');
      return;
    }
    if (!beginOperatorSwitch()) {
      Alert.alert('Operation In Progress', 'Finish the current operation before switching servers.');
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
      Alert.alert('Switch Failed', sessionCleared
        ? 'The old session was cleared. Check the selected server and sign in again.'
        : 'The current server was kept. Please try again.');
    } finally { endOperatorSwitch(); activating.current = false; setBusy(false); }
  };

  const chooseServer = () => {
    if (!candidate || busy || activating.current) return;
    const selected = candidate;
    const request = inspection.current;
    const previous = getActiveOperatorServer();
    if (previous && (previous.origin !== selected.server.origin || previous.instanceId !== selected.server.instanceId)) {
      Alert.alert(
        'Change Warehouse Server',
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

  return <View style={styles.container}>
    <Text style={styles.title}>Choose your warehouse server</Text>
    <Text style={styles.help}>Enter the HTTPS server origin supplied by your operator, or scan its origin QR code.</Text>
    <TextInput value={origin} onChangeText={value => { if (activating.current) return; inspection.current += 1; setBusy(false); setOrigin(value); setCandidate(null); }}
      autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://warehouse.example.com"
      style={styles.input} accessibilityLabel="Server origin" />
    <Button onPress={() => void inspect(origin)} disabled={busy}>Check server</Button>
    <Button type="secondary" onPress={() => void scan()} disabled={busy}>Scan QR code</Button>
    {onCancel && <Button type="secondary" onPress={onCancel} disabled={busy}>Back</Button>}
    {candidate && <View style={styles.preview}>
      <Text style={styles.name}>{candidate.server.displayName}</Text>
      <Text>{candidate.server.companyName}</Text>
      <Text>{candidate.server.origin}</Text>
      <Button onPress={chooseServer} disabled={busy}>Use this server</Button>
    </View>}
    {busy && <ActivityIndicator />}
    <Modal visible={scanning} onRequestClose={() => setScanning(false)}>
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (scanLocked.current) return;
            scanLocked.current = true;
            setScanning(false);
            try { void inspect(parseOperatorOrigin(data)); }
            catch { Alert.alert('Invalid QR Code', 'Scan a QR code containing only an HTTPS server origin.'); }
          }} />
        <Button onPress={() => setScanning(false)}>Cancel</Button>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '700' },
  help: { fontSize: 16, lineHeight: 23 },
  input: { borderWidth: 1, borderColor: '#777', borderRadius: 8, padding: 12, fontSize: 16 },
  preview: { gap: 12, padding: 16, borderWidth: 1, borderColor: '#777', borderRadius: 8 },
  name: { fontSize: 20, fontWeight: '700' },
  cameraContainer: { flex: 1, gap: 16, padding: 16, backgroundColor: '#000' },
  camera: { flex: 1 },
});
