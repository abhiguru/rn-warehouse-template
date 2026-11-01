/**
 * SignedInDevicesSection: the devices a person is signed in on (backend migration 140), on the administrator's user page.
 * Each row names the device (app and system from the user agent), the masked address and when it was last used, tags
 * the device making this request, and offers "Sign out this device" behind a question.
 *
 * Hidden for a backend without the function (PGRST202). Signing out the device in hand signs out here as well, without
 * asking the server again (it already ended the session). A sign out the server answered with "done" but did not do
 * (a session the caller may not revoke) is told as "Not signed out", never as a success: the list is read again after
 * every sign out and decides.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { SectionHeader, StatusTag } from '@/components/ui';
import { fontWeight, space, touchTarget, typography, radius, type ThemeTokens } from '@/theme/tokens';
import { describeUserAgent, revokeOutcome, type UserSession } from '@/features/users/sessionDevices';
import { listUserSessions, revokeSession } from '@/services/session-devices-service';
import { useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { formatRelativeTime } from '@/utils/formatters';
import { t as tr } from '@/i18n';

const makeStyles = (t: ThemeTokens) => ({
  card: { backgroundColor: t.surface.card, borderRadius: radius.card, overflow: 'hidden' as const },
  row: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  rowLast: { borderBottomWidth: 0 },
  name: { ...typography.body, color: t.text.primary, fontWeight: fontWeight.semibold },
  meta: { ...typography.footnote, color: t.text.secondary },
  tagRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  signOut: {
    alignSelf: 'flex-start' as const,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    paddingVertical: space.xs,
  },
  signOutText: { ...typography.callout, fontWeight: fontWeight.semibold, color: t.status.negative.text },
  message: { ...typography.subhead, color: t.text.secondary, paddingHorizontal: space.lg, paddingVertical: space.md },
  retry: { alignSelf: 'flex-start' as const, minHeight: touchTarget, justifyContent: 'center' as const, paddingHorizontal: space.lg },
  retryText: { ...typography.callout, fontWeight: fontWeight.semibold, color: t.brand.tint },
});

interface SignedInDevicesSectionProps {
  /** `user_profiles.id` of the person whose devices are shown. */
  userId: string;
  /** Reports that the backend has no such function, so the page can leave the section out. */
  onUnsupported?: () => void;
}

export function SignedInDevicesSection({ userId, onUnsupported }: SignedInDevicesSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const dispatch = useAppDispatch();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed' | 'hidden'>('loading');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [failure, setFailure] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // The person whose list is on screen: an answer for another person (the page opened on someone else) is dropped.
  const currentUser = useRef(userId);
  currentUser.current = userId;

  const load = useCallback(async (): Promise<UserSession[] | null> => {
    const result = await listUserSessions(userId);
    if (currentUser.current !== userId) return null;
    if (result.success) {
      setSessions(result.sessions);
      setPhase('ready');
      return result.sessions;
    }
    if (result.unsupported) {
      setPhase('hidden');
      onUnsupported?.();
      return null;
    }
    setFailure(result.message);
    setPhase('failed');
    return null;
  }, [userId, onUnsupported]);

  useEffect(() => {
    setPhase('loading');
    setSessions([]);
    void load();
  }, [load]);

  const signOutDevice = useCallback(
    async (session: UserSession) => {
      setBusyId(session.id);
      try {
        const result = await revokeSession(session.id);
        // No answer came: the server may have signed the device out, so the list decides, as after an answer of "done".
        if (!result.success && !result.lostAnswer) {
          if (result.unsupported) {
            setPhase('hidden');
            onUnsupported?.();
            return;
          }
          // The session is gone already: the list says so.
          if (result.code === 'NOT_FOUND') {
            await load();
            return;
          }
          showAlert(tr('users.devices.signOutFailedTitle'), result.message);
          return;
        }
        if (result.success && result.revokedCurrent) {
          // The server ended this phone's session: clear it here as well, without asking the server again.
          await dispatch(logout({ localOnly: true }));
          return;
        }
        const after = await load();
        const outcome = after ? revokeOutcome(false, after, session.id) : 'revoked';
        if (outcome === 'notSignedOut') {
          showAlert(tr('users.devices.notSignedOutTitle'), tr('users.devices.notSignedOut'));
        } else if (!after) {
          // The re-read failed: whether the device is gone is not known, so no success is claimed.
          showAlert(tr('users.devices.unconfirmedTitle'), tr('users.devices.unconfirmed'));
        } else {
          showToast(tr('users.devices.signedOut'));
        }
      } finally {
        setBusyId(null);
      }
    },
    [dispatch, load, onUnsupported]
  );

  const confirmSignOut = useCallback(
    (session: UserSession) => {
      showAlert(
        tr('users.devices.confirmTitle'),
        tr(session.is_current ? 'users.devices.confirmCurrent' : 'users.devices.confirmMessage'),
        [
          { text: tr('common.cancel'), style: 'cancel' },
          { text: tr('users.devices.confirm'), style: 'destructive', onPress: () => void signOutDevice(session) },
        ]
      );
    },
    [signOutDevice]
  );

  if (phase === 'hidden') return null;

  return (
    <View testID="signed-in-devices">
      <SectionHeader title={tr('users.devices.title')} />
      {phase === 'loading' ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={t.brand.tint} style={{ margin: space.lg }} />
        </View>
      ) : phase === 'failed' ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.message}>{failure}</Text>
          <Pressable style={styles.retry} onPress={() => { setPhase('loading'); void load(); }} accessibilityRole="button" accessibilityLabel={tr('common.retry')}>
            <Text style={styles.retryText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.message}>{tr('users.devices.none')}</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {sessions.map((session, index) => {
            const device = describeUserAgent(session.user_agent);
            const name = [device.app, device.system].filter(Boolean).join(' · ') || tr('users.devices.unknownDevice');
            const lastUsed = session.last_refreshed_at ? tr('users.devices.lastUsed', { time: formatRelativeTime(session.last_refreshed_at) }) : null;
            const address = session.created_ip ? tr('users.devices.address', { address: session.created_ip }) : null;
            const busy = busyId === session.id;
            return (
              <View
                key={session.id}
                style={[styles.row, index === sessions.length - 1 && styles.rowLast]}
                testID={`session-row-${session.id}`}
              >
                <View style={styles.tagRow}>
                  <Text style={styles.name} accessibilityLabel={[name, session.is_current ? tr('users.devices.thisDevice') : null].filter(Boolean).join(', ')}>
                    {name}
                  </Text>
                  {session.is_current ? <StatusTag status="informative" label={tr('users.devices.thisDevice')} icon={null} /> : null}
                </View>
                {address ? <Text style={styles.meta}>{address}</Text> : null}
                {lastUsed ? <Text style={styles.meta}>{lastUsed}</Text> : null}
                <Pressable
                  style={styles.signOut}
                  onPress={() => confirmSignOut(session)}
                  disabled={busyId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={tr('users.devices.signOutA11y', { device: name })}
                  accessibilityState={{ disabled: busyId !== null, busy }}
                  testID={`session-signout-${session.id}`}
                >
                  {busy ? <ActivityIndicator size="small" color={t.status.negative.text} /> : <Text style={styles.signOutText}>{tr('users.devices.signOut')}</Text>}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default SignedInDevicesSection;
