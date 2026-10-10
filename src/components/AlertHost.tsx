/**
 * AlertHost: renders showAlert() requests as themed dialogs (style guide
 * §13.9): sheet surface, card radius, shadow 4, scrim, max width 420.
 * Buttons follow the Alert.alert roles: "cancel" is a secondary button,
 * "destructive" uses the destructive fill, and the last default button is the
 * primary action. Two buttons sit side by side; three or more stack.
 * Android back and tapping the scrim cancel, when the alert is cancelable.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, type AlertButton } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { registerAlertHost, type AlertRequest } from '@/utils/alert';
import { t as tr } from '@/i18n';

type Role = 'primary' | 'secondary' | 'destructive';

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
  const [queue, setQueue] = useState<AlertRequest[]>([]);

  useEffect(() => registerAlertHost(request => setQueue(q => [...q, request])), []);

  const current = queue[0];

  const close = useCallback((button?: AlertButton) => {
    setQueue(q => q.slice(1));
    // Let the dialog close before the handler runs (it may open another alert or navigate).
    if (button?.onPress) setTimeout(() => button.onPress?.(), 0);
  }, []);

  const cancel = useCallback(() => {
    if (!current) return;
    if (current.options?.cancelable === false) return;
    const cancelButton = current.buttons.find(b => b.style === 'cancel');
    // Mirror Alert.alert: a one-button alert closes with that button's handler.
    const fallback = current.buttons.length === 1 ? current.buttons[0] : undefined;
    close(cancelButton ?? fallback);
    current.options?.onDismiss?.();
  }, [current, close]);

  if (!current) return null;

  const stacked = current.buttons.length > 2;
  // Side by side: cancel first, action last (action on the right).
  const ordered = stacked
    ? current.buttons
    : [...current.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : b.style === 'cancel' ? 1 : 0));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel} statusBarTranslucent>
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
              {current.title}
            </Text>
            {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          </ScrollView>
          <View style={stacked ? styles.buttonsStack : styles.buttonsRow}>
            {ordered.map((button, index) => {
              const role = roleOf(button, current.buttons.indexOf(button), current.buttons);
              const label = button.text ?? tr('common.ok');
              return (
                <Pressable
                  key={`${label}-${index}`}
                  onPress={() => close(button)}
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
