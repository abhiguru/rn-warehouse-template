/**
 * A sheet rising from the bottom for one short task (docs/STYLE_GUIDE.md §13.9):
 * scrim, rounded top, grab handle, a title row with Cancel and an optional
 * second action, content, and an optional pinned footer above the safe area.
 * Only one is ever open: it is a modal, and nothing opens another from inside it.
 */
import React from 'react';
import { KeyboardAvoidingView, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { fontWeight, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface SheetFrameProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Label of the leading action. Defaults to "Cancel". */
  closeLabel?: string;
  /** Optional trailing text action, e.g. Reset. */
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
    paddingHorizontal: space.sm,
  },
  side: { minWidth: 80, minHeight: touchTarget, justifyContent: 'center' as const, paddingHorizontal: space.sm },
  sideEnd: { alignItems: 'flex-end' as const },
  sideText: { ...typography.callout, color: t.brand.tint },
  sideTextDisabled: { color: t.text.disabled },
  title: { ...typography.headline, flex: 1, textAlign: 'center' as const, color: t.text.primary },
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

export function SheetFrame({ visible, title, onClose, closeLabel = t('common.cancel'), action, tall = false, footer, children }: SheetFrameProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('filters.sheet.closeScrim', { action: closeLabel, title })} />
        <View style={[styles.sheet, tall && styles.sheetTall]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable style={({ pressed }) => [styles.side, pressed && styles.pressed]} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel}>
              <Text style={styles.sideText} maxFontSizeMultiplier={1.6}>{closeLabel}</Text>
            </Pressable>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.6}>{title}</Text>
            <View style={[styles.side, styles.sideEnd]}>
              {action ? (
                <Pressable
                  style={({ pressed }) => pressed && styles.pressed}
                  onPress={action.onPress}
                  disabled={action.disabled}
                  hitSlop={space.md}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityState={{ disabled: !!action.disabled }}
                >
                  <Text style={[styles.sideText, action.disabled && styles.sideTextDisabled]} maxFontSizeMultiplier={1.6}>{action.label}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={[styles.content, tall && styles.contentTall, !footer && { paddingBottom: space.lg + insets.bottom }]}>{children}</View>
          {footer ? <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default SheetFrame;
