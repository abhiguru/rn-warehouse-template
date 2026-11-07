/**
 * Scan facility code (WH-146): the full-screen scanner that pairs this phone with a facility on its local network only.
 * An administrator makes the QR code (Users, the person, "Make sign-in code"); there is no typed code, because the QR
 * carries a secret too long to type. The scan goes to `pairWithFacility` (src/config/localPairing.ts), which checks the
 * server's proof before it keeps anything. Under the viewfinder a help line says what to do when the scan fails.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { useAppDispatch } from '@/store/hooks';
import { setUserProfile } from '@/store/slices/authSlice';
import { parseLanOrigin } from '@/config/lanAddress';
import { pairWithFacility, type PairFailure } from '@/config/localPairing';
import { parsePairingPayload } from '@/config/pairingCrypto';
import type { AppTooOldInfo } from '@/config/appTooOld';
import { clearSignInDraft } from '@/utils/signInDraft';
import { showAlert } from '@/utils/alert';
import { t as tr, type TranslationKey } from '@/i18n';

const FAILURE_TEXT: Record<PairFailure, { title: TranslationKey; message: TranslationKey }> = {
  'used-or-expired': { title: 'auth.localFacility.usedOrExpiredTitle', message: 'auth.localFacility.usedOrExpired' },
  'rate-limited': { title: 'auth.localFacility.usedOrExpiredTitle', message: 'auth.localFacility.tooManyTries' },
  unreachable: { title: 'auth.localFacility.unreachableTitle', message: 'auth.localFacility.unreachable' },
  'wrong-server': { title: 'auth.localFacility.wrongServerTitle', message: 'auth.localFacility.wrongServer' },
  'app-too-old': { title: 'auth.localFacility.failedTitle', message: 'auth.localFacility.appTooOld' },
  cancelled: { title: 'auth.server.busyTitle', message: 'auth.server.busyMessage' },
  busy: { title: 'auth.server.busyTitle', message: 'auth.server.busyMessage' },
  failed: { title: 'auth.localFacility.failedTitle', message: 'auth.localFacility.failed' },
};

interface FacilityCodeScannerProps {
  visible: boolean;
  onClose: () => void;
  /** The facility needs a newer app than this one: the caller shows the "Update the app" screen. */
  onAppTooOld?: (info: AppTooOldInfo) => void;
}

export function FacilityCodeScanner({ visible, onClose, onAppTooOld }: FacilityCodeScannerProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const dispatch = useAppDispatch();
  const [permission, requestPermission] = useCameraPermissions();
  const [working, setWorking] = useState(false);
  // A ref, not the state: the camera reports the same code many times a second.
  const locked = useRef(false);

  const onScanned = async (text: string) => {
    if (locked.current) return;
    locked.current = true;
    const payload = parsePairingPayload(text, parseLanOrigin);
    if (!payload) {
      showAlert(tr('auth.localFacility.notCodeTitle'), tr('auth.localFacility.notCodeMessage'), [
        { text: tr('common.ok'), onPress: () => { locked.current = false; } },
      ]);
      return;
    }
    setWorking(true);
    try {
      const result = await pairWithFacility(
        payload,
        dispatch,
        names =>
          new Promise<boolean>(resolve =>
            showAlert(
              tr('auth.localFacility.switchTitle', { next: names.next }),
              tr('auth.localFacility.switchMessage', { current: names.current }),
              [
                { text: tr('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
                { text: tr('auth.localFacility.switchAction'), style: 'destructive', onPress: () => resolve(true) },
              ]
            )
          )
      );
      // Cancel: the session stays and the code is unspent; the scanner stays open for another scan.
      if (!result.ok && result.reason === 'cancelled') return;
      if (result.ok) {
        clearSignInDraft();
        dispatch(setUserProfile(result.userProfile));
        onClose();
        router.replace('/');
        return;
      }
      if (result.appTooOld && onAppTooOld) {
        onClose();
        onAppTooOld(result.appTooOld);
        return;
      }
      const words = FAILURE_TEXT[result.reason];
      showAlert(tr(words.title), tr(words.message));
    } finally {
      setWorking(false);
      locked.current = false;
    }
  };

  const open = () => {
    locked.current = false;
    if (!permission?.granted) void requestPermission();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!working) onClose(); }} onShow={open}>
      <SafeAreaView style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => { void onScanned(data); }}
          />
        ) : (
          <View style={styles.camera} />
        )}
        {working ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <ActivityIndicator color={t.overlay.onImage} />
            <Text style={styles.hint}>{tr('auth.localFacility.pairing')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>{tr('auth.localFacility.scanHint')}</Text>
            <Text style={styles.help} testID="cant-scan-help">{tr('auth.localFacility.cantScan')}</Text>
          </>
        )}
        <Button type="secondary" variant="normal" size="fullWidth" onPress={onClose} disabled={working} style={styles.cancel} textStyle={styles.cancelText}>
          {tr('common.cancel')}
        </Button>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  // The photo backdrop is the one place pure black is allowed (same as the server QR scanner).
  container: { flex: 1, gap: space.lg, padding: space.lg, backgroundColor: t.overlay.imageBackdrop },
  camera: { flex: 1, borderRadius: radius.card, overflow: 'hidden' as const },
  hint: { ...typography.subhead, color: t.overlay.onImage, textAlign: 'center' as const },
  help: { ...typography.footnote, color: t.overlay.onImage, textAlign: 'center' as const },
  status: { alignItems: 'center' as const, gap: space.sm },
  cancel: { borderColor: t.overlay.onImage },
  cancelText: { color: t.overlay.onImage },
});

export default FacilityCodeScanner;
