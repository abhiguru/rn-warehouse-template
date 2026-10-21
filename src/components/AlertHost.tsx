/**
 * AlertHost: renders showAlert() requests as themed dialogs (style guide
 * §13.9): sheet surface, card radius, shadow 4, scrim, max width 420.
 * Buttons follow the Alert.alert roles: "cancel" is a secondary button,
 * "destructive" uses the destructive fill, and the last default button is the
 * primary action. Two buttons sit side by side; three or more stack.
 * Android back and tapping the scrim cancel, when the alert is cancelable.
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View, type AlertButton } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { closeAlert, getAlertQueue, markAlertHostClosing, registerAlertHost, subscribeAlertQueue, type AlertRequest } from '@/utils/alert';
import { t as tr } from '@/i18n';

type Role = 'primary' | 'secondary' | 'destructive';

/**
 * A dialog ignores every press (buttons, scrim and Android back) for this long after it comes on screen. A
 * double tap on the button of the dialog before it would otherwise answer the next question too, as when a
 * confirmation is followed by a second one.
 */
const PRESS_GUARD_MS = 250;

/** iOS: the longest the host waits for its Modal to say it has finished closing (`onDismiss`) before it says so itself. */
const CLOSE_EVENT_TIMEOUT_MS = 1500;

function roleOf(button: AlertButton, index: number, buttons: AlertButton[]): Role {
  if (button.style === 'destructive') return 'destructive';
  if (button.style === 'cancel') return 'secondary';
  const lastDefault = buttons.map(b => b.style ?? 'default').lastIndexOf('default');
  return index === lastDefault ? 'primary' : 'secondary';
}

const makeStyles = (t: ThemeTokens) => ({
  overlay: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: layout.marginCompact,
  },
  scrim: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.overlay.scrim,
  },
  dialog: {
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    maxHeight: '80%' as const,
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    padding: space.xxl,
    ...t.shadow[4],
  },
  title: {
    ...typography.title3,
    color: t.text.primary,
  },
  message: {
    ...typography.body,
    color: t.text.secondary,
    marginTop: space.sm,
  },
  buttonsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    marginTop: space.xxl,
  },
  buttonsStack: {
    gap: space.sm,
    marginTop: space.xxl,
  },
  button: {
    minHeight: touchTarget,
    minWidth: 96,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  primary: { backgroundColor: t.brand.fill },
  primaryPressed: { backgroundColor: t.brand.fillPressed },
  destructive: { backgroundColor: t.destructive.fill },
  destructivePressed: { backgroundColor: t.destructive.fillPressed },
  secondary: { borderWidth: 1, borderColor: t.border.button },
  secondaryPressed: { backgroundColor: t.brand.subtle },
  label: { ...typography.callout, fontWeight: fontWeight.semibold, textAlign: 'center' as const },
  labelPrimary: { color: t.brand.onFill },
  labelDestructive: { color: t.destructive.onFill },
  labelSecondary: { color: t.text.primary },
});

export function AlertHost() {
  const styles = useThemedStyles(makeStyles);
  // The queue is kept in src/utils/alert.ts: this host may be mounted again while dialogs wait.
  const queue = useSyncExternalStore(subscribeAlertQueue, getAlertQueue);

  useEffect(() => registerAlertHost(), []);

  const current = queue[0];

  // iOS: the last dialog was answered and its Modal has not yet said it finished closing. The Modal stays mounted (hidden)
  // until it does, so that `whenAlertsClosed` can tell a screen that opens a Modal of its own when it is safe to.
  const [closing, setClosing] = useState(false);
  const lastShown = useRef<AlertRequest | undefined>(undefined);
  if (current) lastShown.current = current;
  const finishClosing = useCallback(() => {
    setClosing(false);
    lastShown.current = undefined;
    markAlertHostClosing(false);
  }, []);
  useEffect(() => {
    if (current) {
      // A new dialog is on screen: the Modal is open again, nothing is closing.
      if (closing) finishClosing();
      return undefined;
    }
    if (Platform.OS !== 'ios' || !lastShown.current) return undefined;
    // The queue emptied without the host's own answer (a session ended and dropped the dialogs).
    if (!closing) {
      setClosing(true);
      markAlertHostClosing(true);
    }
    return undefined;
  }, [current, closing, finishClosing]);
  useEffect(() => {
    if (!closing) return undefined;
    // `onDismiss` does not always come (a Modal that was never fully shown): the host says it is closed after a while.
    const timer = setTimeout(finishClosing, CLOSE_EVENT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [closing, finishClosing]);
  useEffect(() => () => markAlertHostClosing(false), []);

  // When the dialog on screen starts to take presses (see PRESS_GUARD_MS).
  const takesPressesAt = useRef(0);
  const currentId = current?.id;
  useEffect(() => {
    if (currentId !== undefined) takesPressesAt.current = Date.now() + PRESS_GUARD_MS;
  }, [currentId]);

  // Returns true when this press closed the dialog. A second press of the same dialog (a double tap before the
  // modal is gone) closes nothing, and then neither its handler nor its onDismiss runs again.
  const close = useCallback((id: number, button?: AlertButton): boolean => {
    // Too soon after the dialog came up: the press belongs to the dialog before it. Nothing runs.
    if (Date.now() < takesPressesAt.current) return false;
    // iOS: the last dialog's Modal takes a moment to close; the host says so before the queue empties, so a screen waiting
    // for `whenAlertsClosed` never sees an empty queue with a Modal still closing.
    const queued = getAlertQueue();
    if (Platform.OS === 'ios' && queued.length === 1 && queued[0].id === id) {
      markAlertHostClosing(true);
      setClosing(true);
    }
    if (!closeAlert(id)) return false;
    // Let the dialog close before the handler runs (it may open another alert or navigate).
    if (button?.onPress) setTimeout(() => button.onPress?.(), 0);
    return true;
  }, []);

  const cancel = useCallback(() => {
    if (!current) return;
    if (current.options?.cancelable === false) return;
    const cancelButton = current.buttons.find(b => b.style === 'cancel');
    // Mirror Alert.alert: a one-button alert closes with that button's handler.
    const fallback = current.buttons.length === 1 ? current.buttons[0] : undefined;
    if (close(current.id, cancelButton ?? fallback)) current.options?.onDismiss?.();
  }, [current, close]);

  // While closing, the Modal is drawn hidden with the last dialog's content, so it can fade out.
  const shown = current ?? (closing ? lastShown.current : undefined);
  if (!shown) return null;

  const stacked = shown.buttons.length > 2;
  // Side by side: cancel first, action last (action on the right).
  const ordered = stacked
    ? shown.buttons
    : [...shown.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : b.style === 'cancel' ? 1 : 0));

  return (
    <Modal
      visible={current !== undefined}
      transparent
      animationType="fade"
      onRequestClose={cancel}
      onDismiss={finishClosing}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.scrim}
          onPress={cancel}
          accessibilityRole="button"
          accessibilityLabel={tr('components.alert.closeDialog')}
        />
        <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
          <ScrollView bounces={false}>
            <Text style={styles.title} accessibilityRole="header">
              {shown.title}
            </Text>
            {shown.message ? <Text style={styles.message}>{shown.message}</Text> : null}
          </ScrollView>
          <View style={stacked ? styles.buttonsStack : styles.buttonsRow}>
            {ordered.map((button, index) => {
              const role = roleOf(button, shown.buttons.indexOf(button), shown.buttons);
              const label = button.text ?? tr('common.ok');
              return (
                <Pressable
                  key={`${label}-${index}`}
                  onPress={() => close(shown.id, button)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={({ pressed }) => [
                    styles.button,
                    role === 'primary' && (pressed ? styles.primaryPressed : styles.primary),
                    role === 'destructive' && (pressed ? styles.destructivePressed : styles.destructive),
                    role === 'secondary' && [styles.secondary, pressed && styles.secondaryPressed],
                  ]}
                >
                  <Text
                    style={[
                      styles.label,
                      role === 'primary' && styles.labelPrimary,
                      role === 'destructive' && styles.labelDestructive,
                      role === 'secondary' && styles.labelSecondary,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default AlertHost;
