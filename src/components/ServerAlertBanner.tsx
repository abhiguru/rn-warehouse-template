/**
 * Server alert banner (WH-146, spec step 12): on Home of a facility on its local network only, administrators see the alerts
 * the server's checker raised ("backup missing", "disk low", ...), because there is no Slack or SMS to carry them. The list
 * (`get_server_alerts`) is read when Home opens and about every minute while it is open; an alert goes when its condition
 * clears. One banner line for the oldest alert, "N more" for the rest, and Details (when it started, what to do).
 * Staff, supervisors and customers never see it, and the call is not made for them.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useAppSelector } from '@/store/hooks';
import { fontWeight, iconSize, layout, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { normalizeRole } from '@/config/roles';
import { getServerAlerts, type ServerAlert } from '@/services/local-facility-service';
import { formatDateTime } from '@/utils/formatters';
import { localizeDigits } from '@/i18n/language';
import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';

export const SERVER_ALERT_POLL_MS = 60 * 1000;

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.status.critical.background,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  text: { ...typography.footnote, color: t.text.primary, flex: 1 },
  details: { minHeight: touchTarget, justifyContent: 'center' as const, paddingHorizontal: space.sm },
  detailsText: { ...typography.callout, fontWeight: fontWeight.semibold, color: t.brand.tint },
});

/** The alerts of the facility, for an administrator of a local-only facility; empty for everyone else. Polls while mounted. */
export function useServerAlerts(): ServerAlert[] {
  const role = useAppSelector(state => normalizeRole(state.auth.userProfile?.role));
  const [alerts, setAlerts] = useState<ServerAlert[]>([]);
  const enabled = role === 'admin' && getActiveOperatorServer()?.kind === 'local';

  const load = useCallback(async () => {
    const found = await getServerAlerts();
    // A read that failed keeps what the banner had: a dropped Wi-Fi moment is not "all clear".
    if (found) setAlerts(found);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAlerts([]);
      return undefined;
    }
    let active = true;
    const run = () => { if (active) void load(); };
    run();
    const timer = setInterval(run, SERVER_ALERT_POLL_MS);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') run(); });
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, load]);

  return enabled ? alerts : [];
}

export function ServerAlertBanner() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const alerts = useServerAlerts();
  if (alerts.length === 0) return null;
  const first = alerts[0];
  const line = tr('components.serverAlert.banner', { alert: first.summary });
  const more = alerts.length > 1 ? ` (${tr('components.serverAlert.moreCount', { count: localizeDigits(String(alerts.length - 1)) })})` : '';

  const showDetails = () => {
    const body = alerts
      .map(alert => [
        alert.summary,
        alert.since ? tr('components.serverAlert.since', { time: formatDateTime(alert.since) }) : '',
        alert.detail,
      ].filter(Boolean).join('\n'))
      .join('\n\n');
    showAlert(tr('components.serverAlert.details'), body, [{ text: tr('components.serverAlert.close') }]);
  };

  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="server-alert-banner">
      <Icon name="alert-circle-outline" size={iconSize.md} color={t.status.critical.text} />
      <Text style={styles.text}>{line + more}</Text>
      <Pressable
        style={styles.details}
        onPress={showDetails}
        accessibilityRole="button"
        accessibilityLabel={tr('components.serverAlert.details')}
        accessibilityHint={tr('components.serverAlert.detailsHint')}
      >
        <Text style={styles.detailsText}>{tr('components.serverAlert.details')}</Text>
      </Pressable>
    </View>
  );
}

export default ServerAlertBanner;
