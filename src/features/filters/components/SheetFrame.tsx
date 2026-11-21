/**
 * A sheet rising from the bottom for one short task (docs/STYLE_GUIDE.md §13.9):
 * scrim, rounded top, grab handle, a title row (title at the start, an optional
 * text action such as Reset, then a close X at the end, as in SearchableBottomSheet),
 * content, and an optional pinned footer above the safe area.
 * Only one is ever open: it is a modal, and nothing opens another from inside it.
 */
import React from 'react';
import { KeyboardAvoidingView, Modal, Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface SheetFrameProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Spoken hint of the close X (a sheet that drops a draft says so). */
  closeHint?: string;
  /** Optional leading control before the title (a back control for a later step). With it the sheet draws no close X; the scrim and Back still call `onClose`. */
  leading?: React.ReactNode;
  /** Optional text action at the end, before the close X, e.g. Reset. */
  action?: { label: string; onPress: () => void; disabled?: boolean };
  /** Take most of the screen (long lists) instead of the height of the content. */
  tall?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const makeStyles = (t: ThemeTokens) => ({
  root: { flex: 1, justifyContent: 'flex-end' as const },
  scrim: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0, backgroundColor: t.overlay.scrim },
  sheet: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    maxHeight: '92%' as const,
    ...t.shadow[4],
  },
  sheetTall: { height: '88%' as const },
  handle: {
    alignSelf: 'center' as const,
    width: 36,
    height: 4,
    marginTop: space.sm,
    borderRadius: radius.pill,
    backgroundColor: t.border.separator,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget + space.sm,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
  },
  side: { minWidth: touchTarget, minHeight: touchTarget, justifyContent: 'center' as const, paddingHorizontal: space.sm },
  closeButton: { borderRadius: radius.pill, minHeight: touchTarget, minWidth: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
  sideText: { ...typography.callout, color: t.brand.tint },
  sideTextDisabled: { color: t.text.disabled },
  title: { ...typography.headline, flex: 1, color: t.text.primary },
  content: { paddingHorizontal: layout.marginCompact, paddingTop: space.sm, paddingBottom: space.lg },
  contentTall: { flex: 1 },
  footer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
    backgroundColor: t.surface.sheet,
  },
  pressed: { opacity: t.interaction.disabledOpacity + 0.2 },
  bold: { fontWeight: fontWeight.semibold },
});

export function SheetFrame({ visible, title, onClose, closeHint, leading, action, tall = false, footer, children }: SheetFrameProps) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  // Reduce Motion: the sheet fades in instead of sliding up (§9).
  const reduceMotion = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Pressable style={styles.scrim} onPress={onClose} accessible={false} importantForAccessibility="no" />
        <View style={[styles.sheet, tall && styles.sheetTall]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            {leading}
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={1.6}>{title}</Text>
            {/* The whole side is the target: at least touchTarget square (§11.2). */}
            {action ? (
              <Pressable
                style={({ pressed }) => [styles.side, pressed && styles.pressed]}
                onPress={action.onPress}
                disabled={action.disabled}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: !!action.disabled }}
              >
                <Text style={[styles.sideText, action.disabled && styles.sideTextDisabled]} maxFontSizeMultiplier={1.6}>{action.label}</Text>
              </Pressable>
            ) : null}
            {leading ? null : (
              <Pressable
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                accessibilityHint={closeHint}
              >
                <Icon name="close" size={iconSize.lg} color={tokens.icon.primary} />
              </Pressable>
            )}
          </View>
          <View style={[styles.content, tall && styles.contentTall, !footer && { paddingBottom: space.lg + insets.bottom }]}>{children}</View>
          {footer ? <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default SheetFrame;
