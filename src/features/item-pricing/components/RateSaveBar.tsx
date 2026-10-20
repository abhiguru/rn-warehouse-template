/**
 * The sticky Save bar of a rate form, outside the scroll view: a note or helper line (the day control, the live
 * change summary), an optional Discard and the primary Save. With the keyboard up it can collapse to the buttons
 * (`collapsed`), and it reports its measured height (`onHeight`) so the form scrolls clear of it.
 */
import React from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface SaveBarAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export interface PrimarySaveAction extends SaveBarAction {
  loading?: boolean;
  loadingText?: string;
}

interface Props {
  /** Above the buttons: a helper line, a day control, a summary. Left out while `collapsed`. */
  children?: React.ReactNode;
  /** A one-line hint under `children` (offline, choose a day). */
  helper?: string | null;
  /** The helper line is a link (a 48 dp target): it takes the person to what the line asks for ("Choose a start date."). */
  onHelperPress?: () => void;
  primary: PrimarySaveAction;
  /** A second, quieter button left of Save. */
  discard?: SaveBarAction;
  /** Keyboard up: the buttons only. */
  collapsed?: boolean;
  /** The measured height of the bar, on every layout. */
  onHeight?: (height: number) => void;
  testID?: string;
}

export function RateSaveBar({ children, helper, onHelperPress, primary, discard, collapsed = false, onHeight, testID = 'save-bar' }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, space.md) }]}
      testID={testID}
      onLayout={(e: LayoutChangeEvent) => onHeight?.(e.nativeEvent.layout.height)}
    >
      {collapsed ? null : children}
      {collapsed || !helper ? null : onHelperPress ? (
        <Pressable style={styles.helperLink} onPress={onHelperPress} accessibilityRole="link" accessibilityLabel={helper} testID={`${testID}-helper`}>
          <Text style={styles.helperLinkText}>{helper}</Text>
        </Pressable>
      ) : (
        <Text style={styles.helper}>{helper}</Text>
      )}
      {discard ? (
        <View style={styles.row}>
          <Button type="secondary" onPress={discard.onPress} disabled={discard.disabled} testID={`${testID}-discard`}>
            {discard.label}
          </Button>
          <View style={styles.grow}>
            <Button type="primary" size="fullWidth" onPress={primary.onPress} disabled={primary.disabled} testID={`${testID}-save`} loading={primary.loading} loadingText={primary.loadingText}>
              {primary.label}
            </Button>
          </View>
        </View>
      ) : (
        <Button type="primary" size="fullWidth" onPress={primary.onPress} disabled={primary.disabled} loading={primary.loading} loadingText={primary.loadingText}>
          {primary.label}
        </Button>
      )}
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  saveBar: {
    paddingTop: space.md,
    paddingHorizontal: layout.marginCompact,
    gap: space.xs,
    minHeight: touchTarget,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  helper: { ...typography.footnote, color: t.text.secondary, textAlign: 'center' as const },
  helperLink: { minHeight: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
  helperLinkText: { ...typography.footnote, color: t.brand.tint, textAlign: 'center' as const, textDecorationLine: 'underline' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md },
  grow: { flex: 1 },
});

export default RateSaveBar;
