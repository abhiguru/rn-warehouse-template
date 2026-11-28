/**
 * The status bar of the phone copy (WH-298; Design product/design/offline-capture.md Part 1; contract section 8): one
 * full-width bar above every tab and every screen under them, in place of OfflineBanner when the facility has the
 * offline feature. It says, in words, whether what the phone shows is current, since when, and whether the first load
 * is still running. Neutral in every state except low storage and the 2-hour limit (critical).
 *
 * One screen-reader stop that reads line 1 then line 2, a polite live region (never an alert); "Try again" is a
 * separate stop. The text wraps and is never cut off. It slides in only when it first appears.
 *
 * Until the phone knows the copy's state (`pending`) the bar is empty at its one-line height: no icon, no words,
 * no screen-reader stop and no announcement. A copy still not open after 5 s, or an attempt to open it that failed,
 * is said instead (Design 1.5).
 */
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { usePhoneCopyStatus } from '@/hooks/usePhoneCopyStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { syncNow } from '@/features/phone-copy/syncEngine';
import { deriveOpeningBar, deriveStatusBar, deriveUnsentLine, joinSentences, line2OpensUnsent, type StatusBarContent } from '@/features/phone-copy/statusBarState';
import { useUnsentSummary } from '@/features/unsent/unsentStore';
import { useSendingUnsent } from '@/features/unsent/useUnsentOnlyBar';
import { iconSize, layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { formatLoadedAt } from '@/utils/formatters';

/** Distance the bar slides in from, when it first appears. */
const HIDDEN_OFFSET = -space.giant;
/** How long the bar stays empty while the copy is not open. */
const OPENING_QUIET_MS = 5_000;

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
  lineTwo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  lineTwoText: {
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

/** Two sentences of line 1 are joined with ". "; a first one that already ends in its own mark only gets the space (Design 1.5 row 6). */
function lineOneText(view: StatusBarContent): string {
  return view.line1
    .map(part => tr(`components.offlineStatus.${part.key}`, part.time === undefined ? undefined : { time: formatLoadedAt(part.time) }))
    .reduce(joinSentences);
}

function lineTwoText(view: StatusBarContent): string | null {
  const line = view.line2;
  if (!line) return null;
  return tr(`components.offlineStatus.${line.key}`, {
    count: line.count,
    ...(line.time === undefined ? {} : { time: formatLoadedAt(line.time) }),
  });
}

/**
 * `unsentOnly`: the facility's copy is off but unsent work is on the phone (WH-301): only line 2 is drawn, with its
 * chevron and its tap into "Unsent items"; there is no line 1 and no "Try again".
 */
export function OfflineStatusBar({ unsentOnly = false }: { unsentOnly?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const snapshot = usePhoneCopyStatus();
  const offline = useIsOffline();
  const { fontScale } = useWindowDimensions();
  const unsent = useUnsentSummary();
  const sending = useSendingUnsent();
  const [translateY] = React.useState(() => new Animated.Value(HIDDEN_OFFSET));

  React.useEffect(() => {
    const animation = Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 100, friction: 10 });
    animation.start();
    return () => animation.stop();
  }, [translateY]);

  const pending = snapshot.pending === true;
  const awaitingOpen = pending && snapshot.copyOpen !== true;
  const [openingSlow, setOpeningSlow] = React.useState(false);
  React.useEffect(() => {
    if (!awaitingOpen) return undefined;
    const timer = setTimeout(() => setOpeningSlow(true), OPENING_QUIET_MS);
    return () => {
      clearTimeout(timer);
      setOpeningSlow(false);
    };
  }, [awaitingOpen]);

  const asOf = snapshot.asOf ? Date.parse(snapshot.asOf) : NaN;
  const openFailed = pending && snapshot.openFailed === true;
  const row = deriveStatusBar({
    phase: snapshot.phase,
    loading: snapshot.running !== null,
    offline,
    current: snapshot.current && !offline,
    lastRunFailed: snapshot.lastRunFailed,
    asOf: Number.isFinite(asOf) ? asOf : null,
    storageLow: snapshot.storageLow,
    unsent,
    running: snapshot.running !== null,
  });
  const opening =
    openFailed || (awaitingOpen && openingSlow)
      ? deriveOpeningBar({ failed: openFailed, retrying: snapshot.openRetrying === true })
      : null;
  const onlyLine = unsentOnly ? deriveUnsentLine(unsent, offline, { sending }) : null;
  const view: StatusBarContent = onlyLine
    ? {
        tone: onlyLine.key === 'unsentUnreadable' ? 'critical' : 'neutral',
        icon: offline ? 'cloud-off-outline' : 'sync',
        line1: [],
        line2: onlyLine,
        action: null,
        actionDisabled: false,
      }
    : (opening ?? row);
  const empty = !unsentOnly && pending && opening === null;
  const critical = !empty && view.tone === 'critical';
  const colors = critical ? tokens.status.critical : tokens.status.neutral;
  const line1 = unsentOnly ? '' : lineOneText(view);
  const line2 = lineTwoText(view);
  const label = line2 && line1 ? joinSentences(line1, line2) : (line2 ?? line1);
  // Line 2 opens "Unsent items" (Design 4.1); the opening states have no line 2.
  const opensUnsent = !empty && opening === null && line2OpensUnsent(view.line2);

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
      <Pressable
        testID="offline-status-bar"
        disabled={!opensUnsent}
        onPress={() => router.push('/unsent-items')}
        style={[styles.status, { backgroundColor: colors.background, paddingTop: (unsentOnly && offline ? 0 : insets.top) + space.sm }]}
        accessible={!empty}
        accessibilityRole={opensUnsent ? 'button' : undefined}
        accessibilityHint={opensUnsent ? tr('offline.barHint') : undefined}
        accessibilityLabel={empty ? undefined : label}
        accessibilityLiveRegion={empty ? 'none' : 'polite'}
      >
        {({ pressed }) => (
          <>
            {pressed && opensUnsent ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.interaction.pressedOverlay }]} />
            ) : null}
            {empty ? (
              // The height of one line of the bar, so nothing below moves when the first state arrives.
              <View style={{ height: Math.max(iconSize.md, typography.footnote.lineHeight * fontScale) }} />
            ) : (
              <>
                <Icon testID="offline-status-bar-icon" name={view.icon} size={iconSize.md} color={colors.text} importantForAccessibility="no" />
                <View style={styles.texts}>
                  {unsentOnly ? null : (
                    <Text testID="offline-status-bar-line1" style={styles.text}>
                      {line1}
                    </Text>
                  )}
                  {line2 ? (
                    <View style={styles.lineTwo}>
                      <Text testID="offline-status-bar-line2" style={[styles.text, styles.lineTwoText]}>
                        {line2}
                      </Text>
                      {opensUnsent ? (
                        <Icon
                          testID="offline-status-bar-chevron"
                          name="chevron-right"
                          size={iconSize.sm}
                          color={tokens.icon.secondary}
                          importantForAccessibility="no"
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </>
            )}
          </>
        )}
      </Pressable>
      {!empty && view.action === 'retry' ? (
        <View style={[styles.actionSlot, { paddingTop: insets.top }]}>
          <Button
            testID="offline-status-bar-retry"
            type="tertiary"
            size="auto"
            style={styles.action}
            disabled={view.actionDisabled}
            accessibilityLabel={tr(openFailed ? 'components.offlineStatus.openRetryLabel' : 'components.offlineStatus.retryLabel')}
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
