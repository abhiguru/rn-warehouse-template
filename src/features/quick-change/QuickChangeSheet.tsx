/**
 * The sheet that changes one lot's rack and mark (WH-302, Design Part 5, 5.2 to 5.5): the GRN form's own rack field with its
 * Floor and Chamber chips, a Mark field, Cancel and Save. Nothing is focused when it opens. Save is disabled until a value
 * differs from the row's, and is never disabled for a wrong value (that is told at Save).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SheetFrame } from '@/features/filters/components/SheetFrame';
import { RackChamberPicker } from '@/features/grn/components/item-form/RackChamberPicker';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui';
import { useThemedStyles } from '@/hooks/useTheme';
import { formatIdentifier, identifierInput, t as tr } from '@/i18n';
import { space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import type { ScrollViewRef } from '@/types/nativeRefs';
import { showAlert } from '@/utils/alert';
import { normaliseLotValue } from './lotChangeService';
import type { QuickChangeTarget } from './useQuickChange';

const RACK_MAX = 30;
const MARK_MAX = 60;
/** From this font scale the buttons stack, Save on top. */
const STACK_FROM_SCALE = 1.5;

const makeStyles = (t: ThemeTokens) => ({
  body: { flexGrow: 0, flexShrink: 1 },
  subtitle: { ...typography.subhead, color: t.text.secondary, marginBottom: space.md },
  field: { marginBottom: space.md },
  error: { ...typography.footnote, color: t.status.negative.text, marginTop: space.xs },
  buttons: { flexDirection: 'row' as const, gap: space.md, paddingBottom: space.md },
  buttonsStacked: { flexDirection: 'column-reverse' as const },
  half: { flex: 1 },
  strip: { marginBottom: space.sm },
});

export interface QuickChangeSheetProps {
  target: QuickChangeTarget;
  saving: boolean;
  /** The words of a refusal told at once; null when there is none. */
  refusal: string | null;
  onClearRefusal: () => void;
  onSave: (values: { rack?: string | null; package_mark?: string | null }) => void;
  onClose: () => void;
  /** The save button's words when they are not "Save" (a held change reads "Accept with changes", WH-304). */
  saveLabel?: string;
}

export function QuickChangeSheet({ target, saving, refusal, onClearRefusal, onSave, onClose, saveLabel }: QuickChangeSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const [rack, setRack] = useState(formatIdentifier(target.shown.rack));
  const [mark, setMark] = useState(formatIdentifier(target.shown.package_mark));
  const [rackError, setRackError] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewRef>(null);
  // Keep Mark in view when the keyboard shrinks the sheet (Android & iOS), without undoing a drag (STYLE_GUIDE §5.2).
  const revealMarkRef = useRef(false);
  const markFocusedRef = useRef(false);
  const lastScrollHeightRef = useRef<number | null>(null);
  const lastContentHeightRef = useRef<number | null>(null);

  // The keyboard can reopen while Mark is still focused (Android Back hides it without a blur): re-arm the reveal.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (!markFocusedRef.current) return;
      revealMarkRef.current = true;
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, []);

  const rackChanged = normaliseLotValue(rack) !== normaliseLotValue(target.shown.rack);
  const markChanged = normaliseLotValue(mark) !== normaliseLotValue(target.shown.package_mark);
  const changed = rackChanged || markChanged;

  const grn = tr('lists.grn.cardTitle', { number: formatIdentifier(target.grnNumber) });
  const title = useMemo(() => (target.itemName === '' ? grn : `${target.itemName} · ${grn}`), [target.itemName, grn]);

  const handleClose = () => {
    if (saving) return;
    if (!changed) {
      onClose();
      return;
    }
    showAlert(tr('common.discardChangesTitle'), tr('common.discardChangesMessage'), [
      { text: tr('common.keepEditing'), style: 'cancel' },
      { text: tr('common.discard'), style: 'destructive', onPress: onClose },
    ]);
  };

  const handleSave = () => {
    if (saving || !changed) return;
    const nextRack = normaliseLotValue(rack);
    const nextMark = normaliseLotValue(mark);
    const tooLongRack = nextRack !== null && Array.from(nextRack).length > RACK_MAX;
    const tooLongMark = nextMark !== null && Array.from(nextMark).length > MARK_MAX;
    setRackError(tooLongRack ? tr('grn.validation.rackMax') : null);
    setMarkError(tooLongMark ? tr('grn.validation.packageMarkMax') : null);
    if (tooLongMark) {
      // The error grows the content: keep Mark and its error in view, even after a drag.
      revealMarkRef.current = true;
      scrollRef.current?.scrollToEnd({ animated: true });
    }
    if (tooLongRack || tooLongMark) return;
    onSave({ ...(rackChanged ? { rack: nextRack } : {}), ...(markChanged ? { package_mark: nextMark } : {}) });
  };

  const edited = () => {
    if (refusal !== null) onClearRefusal();
  };

  const footer = (
    <View>
      {refusal !== null ? (
        <View style={styles.strip} testID="quick-change-refused">
          <InlineValidation message={refusal} variant="error" />
        </View>
      ) : null}
      <View style={[styles.buttons, fontScale >= STACK_FROM_SCALE && styles.buttonsStacked]}>
        <View style={styles.half}>
          <Button type="secondary" variant="normal" size="fullWidth" onPress={handleClose} disabled={saving} testID="quick-change-cancel">
            {tr('common.cancel')}
          </Button>
        </View>
        <View style={styles.half}>
          <Button
            type="primary"
            size="fullWidth"
            onPress={handleSave}
            disabled={!changed || saving}
            loading={saving}
            accessibilityState={{ disabled: !changed || saving, busy: saving }}
            testID="quick-change-save"
          >
            {saveLabel ?? tr('common.save')}
          </Button>
        </View>
      </View>
    </View>
  );

  return (
    <SheetFrame visible title={tr('offline.quickChange.title')} onClose={handleClose} footer={footer}>
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        bounces={false}
        testID="quick-change-sheet"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => {
          revealMarkRef.current = false;
        }}
        onLayout={event => {
          const height = event.nativeEvent.layout.height;
          const previous = lastScrollHeightRef.current;
          lastScrollHeightRef.current = height;
          if (revealMarkRef.current && previous !== null && height < previous) {
            scrollRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onContentSizeChange={(_width, height) => {
          const previous = lastContentHeightRef.current;
          lastContentHeightRef.current = height;
          if (revealMarkRef.current && previous !== null && height > previous) {
            scrollRef.current?.scrollToEnd({ animated: false });
          }
        }}
      >
        <View testID="quick-change-subtitle">
          <Text style={styles.subtitle}>{title}</Text>
          {target.customer ? <Text style={styles.subtitle}>{target.customer}</Text> : null}
        </View>
        <View style={styles.field} testID="quick-change-rack">
          <RackChamberPicker
            value={rack}
            onFocus={() => {
              revealMarkRef.current = false;
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
            onChange={text => {
              setRack(text);
              setRackError(null);
              edited();
            }}
          />
          {rackError !== null ? (
            <Text style={styles.error} testID="quick-change-rack-error" accessibilityLiveRegion="polite">
              {rackError}
            </Text>
          ) : null}
        </View>
        <View style={styles.field}>
          <Input
            label={tr('grn.item.mark')}
            autoCapitalize="characters"
            invalid={markError !== null}
            onPressIn={() => {
              revealMarkRef.current = true;
            }}
            onFocus={() => {
              markFocusedRef.current = true;
              revealMarkRef.current = true;
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
            onBlur={() => {
              markFocusedRef.current = false;
              revealMarkRef.current = false;
            }}
            {...identifierInput(mark, text => {
              setMark(text);
              setMarkError(null);
              edited();
            })}
            testID="quick-change-mark"
          />
          {markError !== null ? (
            <Text style={styles.error} testID="quick-change-mark-error" accessibilityLiveRegion="polite">
              {markError}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SheetFrame>
  );
}
