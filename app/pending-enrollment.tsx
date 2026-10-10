/**
 * Waiting for approval (style guide §14.8 step 4): what was requested, from
 * which facility, and what happens next. No facility data is shown here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import {
  getEnrollmentStatus,
  getPendingEnrollmentToken,
  signOutPendingEnrollment,
} from '@/config/supabaseConfig';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
import { StatusTag } from '@/components/ui';
import { t as tr, type TranslationKey } from '@/i18n';
type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'disabled';
type StatusKind = 'critical' | 'positive' | 'negative';

const STATUS_VIEW: Record<EnrollmentStatus, { kind: StatusKind; icon: string; label: TranslationKey; title: TranslationKey }> = {
  pending: { kind: 'critical', icon: 'alert', label: 'auth.enrollment.status.pending', title: 'auth.enrollment.title.waiting' },
  approved: { kind: 'positive', icon: 'check-circle', label: 'auth.enrollment.status.approved', title: 'auth.enrollment.title.approved' },
  rejected: { kind: 'negative', icon: 'alert-circle', label: 'auth.enrollment.status.rejected', title: 'auth.enrollment.title.notAvailable' },
  disabled: { kind: 'negative', icon: 'alert-circle', label: 'auth.enrollment.status.disabled', title: 'auth.enrollment.title.notAvailable' },
};

export default function PendingEnrollmentScreen() {
  const [status, setStatus] = useState<EnrollmentStatus>('pending');
  const [loading, setLoading] = useState(true);
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const facility = getActiveOperatorServer();
  const facilityName = facility?.companyName || tr('auth.enrollment.theFacility');
  const facilityHost = facility ? facility.origin.replace(/^https:\/\//, '') : '';

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getEnrollmentStatus();
    setLoading(false);
    if (result.success) {
      setStatus(result.status);
    } else {
      showAlert(tr('auth.enrollment.couldNotCheckTitle'), tr('common.checkConnection'));
    }
  }, []);

  useEffect(() => {
    let active = true;
    getPendingEnrollmentToken().then(token => {
      if (!active) return;
      if (!token) router.replace('/login');
      else void refresh();
    }).catch(() => router.replace('/login'));
    return () => { active = false; };
  }, [refresh]);

  const leave = async () => {
    setLoading(true);
    try {
      await signOutPendingEnrollment();
      router.replace('/login');
    } catch {
      setLoading(false);
      showAlert(tr('auth.signOut.couldNotTitle'), tr('common.checkConnection'));
    }
  };

  const message = status === 'approved'
    ? tr('auth.enrollment.approvedMessage', { facility: facilityName })
    : status === 'rejected' || status === 'disabled'
      ? tr('auth.enrollment.noAccessMessage', { facility: facilityName })
      : tr('auth.enrollment.pendingMessage', { facility: facilityName });

  const view = STATUS_VIEW[status];
  const statusLabel = tr(view.label);
  const tone = t.status[view.kind];

  return (
    <View style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.column}>
          <View style={styles.hero}>
            <Icon name={view.icon} size={iconSize.hero} color={tone.text} />
          </View>
          <Text style={styles.heading} accessibilityRole="header">{tr(view.title)}</Text>

          {/* What was requested, and from which facility */}
          <View style={styles.card} accessible accessibilityLabel={`${facilityName}, ${statusLabel}`}>
            <Icon name="office-building-outline" size={iconSize.md} color={t.icon.secondary} />
            <View style={styles.cardText}>
              <Text style={styles.facilityName} numberOfLines={2}>{facilityName}</Text>
              {facilityHost ? <Text style={styles.facilityHost} numberOfLines={1}>{facilityHost}</Text> : null}
            </View>
            <StatusTag status={view.kind} label={statusLabel} icon={view.icon} />
          </View>

          {/* What happens next */}
          <Text style={styles.message}>{message}</Text>

          {loading ? (
            <ActivityIndicator color={t.brand.tint} accessibilityLabel={tr('auth.enrollment.checking')} />
          ) : (
            <View style={styles.actions}>
              {status === 'pending' && (
                <Button size="fullWidth" onPress={() => void refresh()}>{tr('auth.enrollment.checkStatus')}</Button>
              )}
              {status === 'approved' ? (
                <Button size="fullWidth" onPress={() => void leave()}>{tr('auth.signIn')}</Button>
              ) : (
                <Button
                  size="fullWidth"
                  type={status === 'pending' ? 'secondary' : 'primary'}
                  variant={status === 'pending' ? 'normal' : 'tint'}
                  onPress={() => void leave()}
                >
                  {tr('auth.signOut.action')}
                </Button>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  content: { flexGrow: 1, justifyContent: 'center' as const, paddingHorizontal: layout.marginCompact },
  column: { width: '100%' as const, maxWidth: layout.maxFormWidth, alignSelf: 'center' as const, gap: space.xl },
  hero: { alignItems: 'center' as const },
  heading: { ...typography.title1, color: t.text.primary, textAlign: 'center' as const },
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  cardText: { flex: 1 },
  facilityName: { ...typography.headline, color: t.text.primary },
  facilityHost: { ...typography.subhead, color: t.text.secondary },
  message: { ...typography.body, color: t.text.secondary, textAlign: 'center' as const },
  actions: { gap: space.md },
});
