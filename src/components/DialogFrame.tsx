/**
 * DialogFrame - the one frame of every dialog (docs/STYLE_GUIDE.md §13.9; ConfirmDialog is
 * the reference): `surface.sheet`, `radius.card`, `shadow[4]` over `overlay.scrim`, padding
 * `space.xxl`, at most `layout.maxFormWidth` wide, an optional status icon in its circle, the title
 * in `title3`, the message in `body` `text.secondary`, then the buttons.
 *
 * Pieces, so each dialog keeps its own content and its own Modal:
 *   <Modal>
 *     <DialogOverlay onScrimPress>            scrim and centring
 *       <DialogCard>                          the card
 *         <DialogBody>                        scrolls when the content is long
 *           <DialogHeading />                 icon, title, message
 *           ...the dialog's own content
 *         </DialogBody>
 *         <DialogActions>                     two side by side; three or more `stacked`
 *           <DialogButton />
 *         </DialogActions>
 *       </DialogCard>
 *     </DialogOverlay>
 *   </Modal>
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import type { TextRef } from '@/types/nativeRefs';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

export type DialogTone = 'default' | 'warning' | 'danger' | 'success';
export type DialogButtonRole = 'secondary' | 'primary' | 'negative';

const ICON_CIRCLE = layout.avatar.lg - space.xs;

const makeStyles = (t: ThemeTokens) => ({
  overlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xxl,
  },
  card: {
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    maxHeight: '100%' as const,
    flexShrink: 1,
    ...t.shadow[4],
  },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: {
    alignItems: 'center' as const,
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
    paddingBottom: space.lg,
  },
  iconContainer: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.lg,
  },
  iconDefault: { backgroundColor: t.brand.subtle },
  iconWarning: { backgroundColor: t.status.critical.background },
  iconDanger: { backgroundColor: t.status.negative.background },
  iconSuccess: { backgroundColor: t.status.positive.background },
  title: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const, alignSelf: 'stretch' as const },
  message: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'center' as const,
    alignSelf: 'stretch' as const,
    marginTop: space.sm,
  },
  messageLeft: { textAlign: 'left' as const },
  actionsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    paddingHorizontal: space.xxl,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
  },
  actionsStack: {
    gap: space.sm,
    paddingHorizontal: space.xxl,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
  },
  button: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  buttonSide: { flexGrow: 1, flexBasis: 120 },
  secondary: { borderWidth: 1, borderColor: t.border.button },
  secondaryPressed: { backgroundColor: t.brand.subtle },
  primary: { backgroundColor: t.brand.fill },
  primaryPressed: { backgroundColor: t.brand.fillPressed },
  negative: { backgroundColor: t.destructive.fill },
  negativePressed: { backgroundColor: t.destructive.fillPressed },
  label: { ...typography.callout, fontWeight: fontWeight.semibold, textAlign: 'center' as const },
  labelSecondary: { color: t.text.primary },
  labelPrimary: { color: t.brand.onFill },
  labelNegative: { color: t.destructive.onFill },
  disabled: { opacity: t.interaction.disabledOpacity },
});

export interface DialogOverlayProps {
  children: React.ReactNode;
  /** A tap on the scrim. Absent: the scrim does nothing. */
  onScrimPress?: () => void;
  /** Spoken name of the scrim as a button; without it the scrim is hidden from the screen reader. */
  scrimLabel?: string;
  /** Keep clear of the system bars (a dialog that scrolls or sits above the keyboard). */
  safeArea?: boolean;
  style?: StyleProp<ViewStyle>;
}

function OverlayView({ children, onScrimPress, scrimLabel, style, top = 0, bottom = 0 }: DialogOverlayProps & { top?: number; bottom?: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.overlay, { paddingTop: top || space.xxl, paddingBottom: bottom || space.xxl }, style]}>
      {scrimLabel ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={onScrimPress} accessibilityRole="button" accessibilityLabel={scrimLabel} />
      ) : (
        <Pressable style={StyleSheet.absoluteFill} onPress={onScrimPress} accessible={false} importantForAccessibility="no" />
      )}
      {children}
    </View>
  );
}

// The insets are read only by a dialog that asks for them (tests render a plain one without a provider).
function SafeOverlay(props: DialogOverlayProps) {
  const insets = useSafeAreaInsets();
  return <OverlayView {...props} top={insets.top + space.lg} bottom={insets.bottom + space.lg} />;
}

/** The scrim, centring the card. */
export function DialogOverlay(props: DialogOverlayProps) {
  return props.safeArea ? <SafeOverlay {...props} /> : <OverlayView {...props} />;
}

/**
 * Whether the card's buttons are in the accessibility tree yet. They join it when the heading has sent the title
 * focus event, so the title is the only thing TalkBack can pick first (WH-292). Outside a card: always settled.
 */
const DialogSettleContext = createContext<{ settled: boolean; markSettled: () => void }>({ settled: true, markSettled: () => undefined });

export interface DialogCardProps {
  children: React.ReactNode;
  testID?: string;
  accessibilityRole?: 'alert';
  accessibilityLabel?: string;
}

/** The card itself. */
export function DialogCard({ children, testID, accessibilityRole, accessibilityLabel }: DialogCardProps) {
  const styles = useThemedStyles(makeStyles);
  const [settled, setSettled] = useState(false);
  const markSettled = useCallback(() => setSettled(true), []);
  // Fallback: a card whose heading never reports (no heading, no layout) shows its buttons to screen readers by then.
  useEffect(() => {
    const fallback = setTimeout(markSettled, REVEAL_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [markSettled]);
  const value = React.useMemo(() => ({ settled, markSettled }), [settled, markSettled]);
  return (
    <DialogSettleContext.Provider value={value}>
      <View style={styles.card} accessibilityViewIsModal accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} testID={testID}>
        {children}
      </View>
    </DialogSettleContext.Provider>
  );
}

export interface DialogBodyProps {
  children: React.ReactNode;
  testID?: string;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}

/** The content above the buttons; scrolls when it does not fit. */
export function DialogBody({ children, testID, keyboardShouldPersistTaps }: DialogBodyProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.bodyContent}
      bounces={false}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

export interface DialogHeadingProps {
  title: string;
  message?: string;
  tone?: DialogTone;
  /** Overrides the icon of the tone (a tone of `default` draws none without it). */
  icon?: IconName;
  messageAlign?: 'center' | 'left';
}

/** Wait after the title's first layout before moving screen-reader focus, so the Modal window has settled. */
const FOCUS_SETTLE_MS = 400;
/** Wait after the focus event before the message joins the accessibility tree, so TalkBack does not re-pick it. */
const REVEAL_MS = 300;
/** Latest moment the message joins the accessibility tree, whatever else failed. */
const REVEAL_FALLBACK_MS = 1500;

const TONE_ICON: Record<DialogTone, IconName | undefined> = {
  default: undefined,
  warning: 'alert-outline',
  danger: 'alert-circle-outline',
  success: 'check-circle',
};

/**
 * Status icon in its circle, the title and the message. When the dialog opens, screen-reader focus moves to the
 * title: once, `FOCUS_SETTLE_MS` after its first layout. A Modal is a new window and TalkBack picks its own first
 * item, and a delayed event alone did not win (WH-292). So the message is kept out of the accessibility tree until
 * the focus event has been sent, and revealed `REVEAL_MS` later, together with the card's buttons (DialogActions;
 * a dialog with two buttons still had TalkBack on the first one). All is drawn the same all along; screen-reader
 * users still reach it by swiping. The reveal happens with a screen reader off too. Timers are cleared on unmount. Where
 * focus events are not available nothing happens.
 */
export function DialogHeading({ title, message, tone = 'default', icon, messageAlign = 'center' }: DialogHeadingProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const titleRef = useRef<TextRef>(null);
  const scheduled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [messageReadable, setMessageReadable] = useState(false);
  const { markSettled } = useContext(DialogSettleContext);
  const reveal = useCallback(() => {
    setMessageReadable(true);
    markSettled();
  }, [markSettled]);
  useEffect(() => {
    // Fallback: whatever happens below (no layout, a failed event), the message is readable by then.
    const fallback = setTimeout(reveal, REVEAL_FALLBACK_MS);
    return () => {
      clearTimeout(fallback);
      clearTimeout(timer.current);
      clearTimeout(revealTimer.current);
    };
  }, [reveal]);
  const focusTitle = useCallback(() => {
    if (scheduled.current) return;
    scheduled.current = true;
    timer.current = setTimeout(() => {
      try {
        if (titleRef.current) {
          AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
          revealTimer.current = setTimeout(reveal, REVEAL_MS);
          return;
        }
      } catch {
        // Not available on this platform: the dialog still works.
      }
      reveal();
    }, FOCUS_SETTLE_MS);
  }, [reveal]);
  const name = icon ?? TONE_ICON[tone];
  const color =
    tone === 'danger' ? t.status.negative.text : tone === 'warning' ? t.status.critical.text : tone === 'success' ? t.status.positive.text : t.brand.tint;
  const bg = tone === 'danger' ? styles.iconDanger : tone === 'warning' ? styles.iconWarning : tone === 'success' ? styles.iconSuccess : styles.iconDefault;
  return (
    <>
      {name ? (
        <View style={[styles.iconContainer, bg]} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon name={name} size={iconSize.xl} color={color} />
        </View>
      ) : null}
      <Text ref={titleRef} onLayout={focusTitle} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text
          style={[styles.message, messageAlign === 'left' && styles.messageLeft]}
          importantForAccessibility={messageReadable ? 'auto' : 'no-hide-descendants'}
          accessibilityElementsHidden={!messageReadable}
        >
          {message}
        </Text>
      ) : null}
    </>
  );
}

export interface DialogActionsProps {
  children: React.ReactNode;
  /** Three or more buttons: stacked, full width, the action first and the cancel last. */
  stacked?: boolean;
}

/** The buttons: two side by side (cancel first), or stacked. */
export function DialogActions({ children, stacked = false }: DialogActionsProps) {
  const styles = useThemedStyles(makeStyles);
  const { settled } = useContext(DialogSettleContext);
  return (
    <View
      style={stacked ? styles.actionsStack : styles.actionsRow}
      importantForAccessibility={settled ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!settled}
    >
      {children}
    </View>
  );
}

export interface DialogButtonProps {
  label: string;
  onPress: () => void;
  role?: DialogButtonRole;
  /** Side by side (the default) or full width in a stack. */
  stacked?: boolean;
  /** A spinner takes the place of the label (or sits before `busyLabel`) and the button is disabled. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
  testID?: string;
}

/** `secondary` is outlined (cancel), `primary` the action, `negative` a destructive action. */
export function DialogButton({ label, onPress, role = 'secondary', stacked = false, busy = false, busyLabel, disabled = false, icon, accessibilityLabel, testID }: DialogButtonProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const off = busy || disabled;
  const labelColor = role === 'primary' ? styles.labelPrimary : role === 'negative' ? styles.labelNegative : styles.labelSecondary;
  const spinnerColor = role === 'primary' ? t.brand.onFill : role === 'negative' ? t.destructive.onFill : t.brand.tint;
  const iconColor = role === 'primary' ? t.brand.onFill : role === 'negative' ? t.destructive.onFill : t.brand.tint;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        !stacked && styles.buttonSide,
        role === 'secondary' && styles.secondary,
        role === 'secondary' && pressed && styles.secondaryPressed,
        role === 'primary' && (pressed ? styles.primaryPressed : styles.primary),
        role === 'negative' && (pressed ? styles.negativePressed : styles.negative),
        disabled && !busy && styles.disabled,
        busy && role === 'secondary' && styles.disabled,
      ]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy }}
      testID={testID}
    >
      {busy ? (
        <>
          <ActivityIndicator size="small" color={spinnerColor} />
          {busyLabel ? <Text style={[styles.label, labelColor]}>{busyLabel}</Text> : null}
        </>
      ) : (
        <>
          {icon ? <Icon name={icon} size={iconSize.md} color={iconColor} /> : null}
          <Text style={[styles.label, labelColor]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
