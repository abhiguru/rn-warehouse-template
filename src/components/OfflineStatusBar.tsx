/**
 * The status bar of the phone copy (WH-298; Design product/design/offline-capture.md Part 1; contract section 8): one
 * full-width bar above every tab and every screen under them, in place of OfflineBanner when the facility has the
 * offline feature. It says, in words, whether what the phone shows is current, since when, and whether the first load
 * is still running. Neutral in every state except low storage and the 2-hour limit (critical).
 *
 * One screen-reader stop that reads line 1 then line 2, a polite live region (never an alert); "Try again" is a
 * separate stop. The text wraps and is never cut off. It slides in only when it first appears.
 */
import React from 'react';
import { Animated, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { usePhoneCopyStatus } from '@/hooks/usePhoneCopyStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { syncNow } from '@/features/phone-copy/syncEngine';
import { deriveStatusBar, type StatusBarView } from '@/features/phone-copy/statusBarState';
import { iconSize, layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { formatLoadedAt } from '@/utils/formatters';

/** Distance the bar slides in from, when it first appears. */
const HIDDEN_OFFSET = -space.giant;

const makeStyles = (t: ThemeTokens) => ({
  frame: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1,
  },
  status: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingBottom: space.sm,
    paddingLeft: layout.marginCompact,
    paddingRight: layout.marginCompact,
  },
  actionSlot: {
    justifyContent: 'center' as const,
    paddingRight: layout.marginCompact,
  },
  texts: {
    flexShrink: 1,
    flexGrow: 1,
  },
  text: {
    ...typography.footnote,
    color: t.text.primary,
  },
  action: {
    minHeight: touchTarget,
    minWidth: touchTarget,
  },
});

function lineOneText(view: StatusBarView): string {
  return view.line1
    .map(part => tr(`components.offlineStatus.${part.key}`, part.time === undefined ? undefined : { time: formatLoadedAt(part.time) }))
    .join(' ');
}

function lineTwoText(view: StatusBarView): string | null {
  const line = view.line2;
  if (!line) return null;
  return tr(`components.offlineStatus.${line.key}`, {
    count: line.count,
    ...(line.time === undefined ? {} : { time: formatLoadedAt(line.time) }),
  });
}

export function OfflineStatusBar() {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const snapshot = usePhoneCopyStatus();
  const offline = useIsOffline();
  const [translateY] = React.useState(() => new Animated.Value(HIDDEN_OFFSET));

  React.useEffect(() => {
    const animation = Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 100, friction: 10 });
    animation.start();
    return () => animation.stop();
  }, [translateY]);

  const asOf = snapshot.asOf ? Date.parse(snapshot.asOf) : NaN;
  const view = deriveStatusBar({
    phase: snapshot.phase,
    loading: snapshot.running !== null,
    offline,
    current: snapshot.current && !offline,
    lastRunFailed: snapshot.lastRunFailed,
    asOf: Number.isFinite(asOf) ? asOf : null,
    storageLow: snapshot.storageLow,
    // Unsent work arrives with WH-301.
    unsent: null,
    running: snapshot.running !== null,
  });
  const critical = view.tone === 'critical';
  const colors = critical ? tokens.status.critical : tokens.status.neutral;
  const line1 = lineOneText(view);
  const line2 = lineTwoText(view);
  const label = line2 ? `${line1}. ${line2}` : line1;

  // The bar is two parts side by side on one background: the status (one screen-reader stop with the words) and,
  // when there is one, "Try again" (its own stop, so a screen reader reaches it on both platforms).
  return (
    <Animated.View
      style={[
        styles.frame,
        {
          backgroundColor: colors.background,
          borderBottomColor: critical ? colors.border : tokens.border.divider,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        testID="offline-status-bar"
        style={[styles.status, { backgroundColor: colors.background, paddingTop: insets.top + space.sm }]}
        accessible
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
      >
        <Icon testID="offline-status-bar-icon" name={view.icon} size={iconSize.md} color={colors.text} importantForAccessibility="no" />
        <View style={styles.texts}>
          <Text testID="offline-status-bar-line1" style={styles.text}>
            {line1}
          </Text>
          {line2 ? (
            <Text testID="offline-status-bar-line2" style={styles.text}>
              {line2}
            </Text>
          ) : null}
        </View>
      </View>
      {view.action === 'retry' ? (
        <View style={[styles.actionSlot, { paddingTop: insets.top }]}>
          <Button
            testID="offline-status-bar-retry"
            type="tertiary"
            size="auto"
            style={styles.action}
            disabled={view.actionDisabled}
            accessibilityLabel={tr('components.offlineStatus.retryLabel')}
            onPress={() => {
              if (!view.actionDisabled) void syncNow('retry');
            }}
          >
            {tr('common.retry')}
          </Button>
        </View>
      ) : null}
    </Animated.View>
  );
}

export default OfflineStatusBar;
