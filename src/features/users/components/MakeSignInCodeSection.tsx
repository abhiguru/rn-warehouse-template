/**
 * MakeSignInCodeSection (WH-146): on the administrator's user page of a facility on its local network only, "Make sign-in
 * code" shows the QR code that signs this person in on one phone (backend `make_pairing_code`). The code is valid for 10
 * minutes and works once; the screen counts the time down and removes the QR when it runs out. There is no typed code: the
 * QR carries a secret too long to type (Product, 2026-11-07). The person scans it with "Scan facility code" on the first
 * screen of the app.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { makePairingCode } from '@/services/local-facility-service';
import { qrModules, qrPath } from '@/utils/qrCode';
import { localizeDigits } from '@/i18n/language';
import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';

const QR_SIZE = 248;
const QUIET = 4;

const makeStyles = (t: ThemeTokens) => ({
  card: { backgroundColor: t.surface.card, borderRadius: radius.card, padding: space.lg, gap: space.md, alignItems: 'center' as const },
  // A QR code is read by a camera: dark on light in every theme (the photo backdrop and its text colour are the fixed pair).
  qrFrame: { backgroundColor: t.overlay.onImage, borderRadius: radius.card, padding: space.sm },
  line: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  strong: { ...typography.headline, color: t.text.primary, textAlign: 'center' as const },
  actions: { alignSelf: 'stretch' as const },
});

interface MakeSignInCodeSectionProps {
  /** `user_profiles.id` of the person the code is for. */
  userId: string;
  /** The name shown in "for {{name}} only". */
  name: string;
}

const clock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return localizeDigits(`${minutes}:${seconds}`);
};

export function MakeSignInCodeSection({ userId, name }: MakeSignInCodeSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ svg: string; size: number; expiresAt: number; name: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const current = useRef(userId);
  current.current = userId;

  // The code is for one person: another person's page never shows it, and leaving the page drops it.
  useEffect(() => {
    setShown(null);
    return () => setShown(null);
  }, [userId]);

  useEffect(() => {
    if (!shown) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [shown]);

  const remaining = shown ? shown.expiresAt - now : 0;
  const expired = shown !== null && remaining <= 0;
  useEffect(() => {
    if (expired) setShown(null);
  }, [expired]);
  const [wasExpired, setWasExpired] = useState(false);
  useEffect(() => {
    if (expired) setWasExpired(true);
  }, [expired]);

  const make = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await makePairingCode(userId);
      if (current.current !== userId) return;
      if (!result.success) {
        showAlert(tr('users.signInCode.failedTitle'), result.message);
        return;
      }
      const { size, modules } = qrModules(result.qrText);
      setShown({ svg: qrPath(size, modules, QUIET), size: size + 2 * QUIET, expiresAt: result.expiresAt, name: result.person.name || name });
      setNow(Date.now());
      setWasExpired(false);
    } catch {
      showAlert(tr('users.signInCode.failedTitle'), tr('users.signInCode.failed'));
    } finally {
      setBusy(false);
    }
  }, [busy, name, userId]);

  return (
    <View testID="make-sign-in-code">
      <SectionHeader title={tr('users.signInCode.title')} />
      <View style={styles.card}>
        {shown && !expired ? (
          <>
            <View style={styles.qrFrame} accessible accessibilityRole="image" accessibilityLabel={tr('users.signInCode.qrLabel', { name: shown.name })}>
              <Svg width={QR_SIZE} height={QR_SIZE} viewBox={`0 0 ${shown.size} ${shown.size}`}>
                <Rect x={0} y={0} width={shown.size} height={shown.size} fill={tokens.overlay.onImage} />
                <Path d={shown.svg} fill={tokens.overlay.imageBackdrop} />
              </Svg>
            </View>
            <Text style={styles.strong}>{tr('users.signInCode.valid', { name: shown.name })}</Text>
            <Text style={styles.line} accessibilityLiveRegion="polite">{tr('users.signInCode.timeLeft', { time: clock(remaining) })}</Text>
            <Text style={styles.line}>{tr('users.signInCode.scanHint', { name: shown.name })}</Text>
          </>
        ) : wasExpired ? (
          <Text style={styles.line} accessibilityLiveRegion="polite">{tr('users.signInCode.expired')}</Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            size="fullWidth"
            type={shown && !expired ? 'secondary' : 'primary'}
            onPress={() => void make()}
            disabled={busy}
            accessibilityHint={tr('users.signInCode.makeHint')}
          >
            {tr(shown || wasExpired ? 'users.signInCode.makeAnother' : 'users.signInCode.make')}
          </Button>
        </View>
      </View>
    </View>
  );
}

export default MakeSignInCodeSection;
