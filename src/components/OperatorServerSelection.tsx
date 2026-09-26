import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { resetForm as resetGrn } from '@/store/slices/grnFormSlice';
import { resetForm as resetDispatch } from '@/store/slices/dispatchFormSlice';
import { resetForm as resetInvoice } from '@/store/slices/invoiceFormSlice';
import { resetForm as resetCustomer } from '@/store/slices/customerFormSlice';
import ConfigService from '@/services/configService';
import { clearAutocompleteCache } from '@/services/autocomplete-service';
import { queryClient } from '@/lib/queryClient';
import { beginOperatorSwitch, clearPendingEnrollment, endOperatorSwitch, getPendingEnrollmentToken, signOutPendingEnrollment } from '@/config/supabaseConfig';
import { commitStagedOperatorServer, discoverOperator, getActiveOperatorServer, parseOperatorOrigin, stageOperatorServer } from '@/config/operatorServer';

type Discovery = Awaited<ReturnType<typeof discoverOperator>>;

export function OperatorServerSelection({ initial = false }: { initial?: boolean }) {
  const dispatch = useAppDispatch();
  const [origin, setOrigin] = useState('');
  const [candidate, setCandidate] = useState<Discovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const inspect = async (value: string) => {
    setBusy(true);
    setCandidate(null);
    try {
      const discovered = await discoverOperator(value);
      setOrigin(discovered.server.origin);
      setCandidate(discovered);
    } catch (error) {
      Alert.alert('Server Unavailable', error instanceof Error ? error.message : 'Could not inspect this server.');
    } finally { setBusy(false); }
  };

  const scan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setScanning(true);
  };

  const activate = async () => {
    if (!candidate || busy) return;
    if (queryClient.isMutating() > 0) {
      Alert.alert('Operation In Progress', 'Finish the current operation before switching servers.');
      return;
    }
    if (!beginOperatorSwitch()) {
      Alert.alert('Operation In Progress', 'Finish the current operation before switching servers.');
      return;
    }
    setBusy(true);
    let sessionCleared = false;
    try {
      const previous = getActiveOperatorServer();
      if (previous?.origin === candidate.server.origin && previous.instanceId === candidate.server.instanceId) {
        if (!initial) router.back();
        return;
      }
      await stageOperatorServer(candidate.server);
      sessionCleared = true;
      await dispatch(logout()).unwrap();
      if (await getPendingEnrollmentToken()) {
        if (previous) await signOutPendingEnrollment();
        else await clearPendingEnrollment();
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      clearAutocompleteCache();
      dispatch(resetGrn());
      dispatch(resetDispatch());
      dispatch(resetInvoice());
      dispatch(resetCustomer());
      await ConfigService.clearCache();
      await commitStagedOperatorServer(candidate.server);
      if (!initial) router.replace('/login');
    } catch {
      Alert.alert('Switch Failed', sessionCleared
        ? 'The old session was cleared. Check the selected server and sign in again.'
        : 'The current server was kept. Please try again.');
    } finally { endOperatorSwitch(); setBusy(false); }
  };

  return <View style={styles.container}>
    <Text style={styles.title}>Choose your warehouse server</Text>
    <Text style={styles.help}>Enter the HTTPS server origin supplied by your operator, or scan its origin QR code.</Text>
    <TextInput value={origin} onChangeText={value => { setOrigin(value); setCandidate(null); }}
      autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://warehouse.example.com"
      style={styles.input} accessibilityLabel="Server origin" />
    <Button onPress={() => void inspect(origin)} disabled={busy}>Check server</Button>
    <Button type="secondary" onPress={() => void scan()} disabled={busy}>Scan QR code</Button>
    {candidate && <View style={styles.preview}>
      <Text style={styles.name}>{candidate.server.displayName}</Text>
      <Text>{candidate.server.companyName}</Text>
      <Text>{candidate.server.origin}</Text>
      <Button onPress={() => void activate()} disabled={busy}>Use this server</Button>
    </View>}
    {busy && <ActivityIndicator />}
    <Modal visible={scanning} onRequestClose={() => setScanning(false)}>
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
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
