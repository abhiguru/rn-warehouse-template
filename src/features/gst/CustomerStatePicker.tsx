/**
 * The customer's State, picked from the list of Indian states and union territories (WH-151, backend migration 173): the name
 * picked is saved, and the server derives the state code from it (and uses the GSTIN's first two digits when there is one) to
 * decide CGST and SGST or IGST. A state typed before as free text that is not on the list is shown as it was saved, with a note
 * to choose one; nothing is changed until a state is chosen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { PreferenceSheet, type PreferenceOption } from '@/features/settings/components/PreferenceSheet';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import type { ViewRef } from '@/types/nativeRefs';
import { INDIAN_STATES } from './indianStates';

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    field: { gap: space.xs },
    label: { ...typography.footnote, color: t.text.secondary },
    labelError: { color: t.status.negative.text },
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.field,
      paddingHorizontal: space.md,
      minHeight: touchTarget,
      backgroundColor: t.surface.field,
      borderColor: t.border.field,
    },
    boxPressed: { backgroundColor: t.surface.cardPressed },
    boxError: { borderColor: t.status.negative.border, borderWidth: 2 },
    value: { ...typography.body, color: t.text.primary, flex: 1 },
    placeholder: { ...typography.body, color: t.text.placeholder, flex: 1 },
    note: { ...typography.footnote, color: t.text.secondary },
    messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
    errorText: { ...typography.footnote, flex: 1, color: t.status.negative.text },
  });

interface Props {
  /** The state as saved (free text or a name from the list). */
  value: string;
  onChange: (name: string) => void;
  error?: string;
  /**
   * Gives the form a handle whose `focus()` brings the State into view and moves screen-reader focus to it
   * (the box is a button, not a text input, so it cannot take keyboard focus).
   */
  inputRef?: (node: { focus: () => void } | null) => void;
  /** Scrolls the form to the node with this native handle. */
  scrollIntoView?: (handle: number) => void;
}

export function CustomerStatePicker({ value, onChange, error, inputRef, scrollIntoView }: Props) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<ViewRef>(null);
  const scrollRef = useRef(scrollIntoView);
  scrollRef.current = scrollIntoView;

  useEffect(() => {
    if (!inputRef) return undefined;
    inputRef({
      focus: () => {
        const handle = boxRef.current ? findNodeHandle(boxRef.current) : null;
        if (handle == null) return;
        scrollRef.current?.(handle);
        AccessibilityInfo.setAccessibilityFocus(handle);
      },
    });
    return () => inputRef(null);
  }, [inputRef]);
  const text = value.trim();
  const onList = INDIAN_STATES.some((state) => state.name === text);

  const options: PreferenceOption<string>[] = [
    { value: '', label: tr('gst.customer.noState') },
    ...INDIAN_STATES.map((state) => ({ value: state.name, label: state.name })),
  ];

  return (
    <View style={styles.field}>
      <Text style={[styles.label, !!error && styles.labelError]}>{tr('gst.customer.state')}</Text>
      <Pressable
        ref={boxRef}
        style={({ pressed }) => [styles.box, pressed && styles.boxPressed, !!error && styles.boxError]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${tr('gst.customer.state')}, ${text || tr('gst.customer.notChosen')}`}
        accessibilityHint={tr('gst.customer.chooseState')}
        testID="customer-state-picker"
      >
        <Text style={text ? styles.value : styles.placeholder} numberOfLines={2}>{text || tr('gst.customer.chooseState')}</Text>
        <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
      {error ? (
        <View style={styles.messageRow} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : text && !onList ? (
        <Text style={styles.note}>{tr('gst.customer.currentText', { text })}</Text>
      ) : (
        <Text style={styles.note}>{tr('gst.customer.stateHelp')}</Text>
      )}
      {open ? (
        <PreferenceSheet
          visible
          title={tr('gst.customer.state')}
          options={options}
          selected={onList ? text : ''}
          onSelect={(name) => {
            onChange(name);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          testID="customer-state-sheet"
        />
      ) : null}
    </View>
  );
}
