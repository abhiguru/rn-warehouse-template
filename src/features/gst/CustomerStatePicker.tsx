/**
 * The customer's State, picked from the list of Indian states and union territories (WH-151, backend migration 173): the name
 * picked is saved, and the server derives the state code from it (and uses the GSTIN's first two digits when there is one) to
 * decide CGST and SGST or IGST. A state typed before as free text that is not on the list is shown as it was saved, with a note
 * to choose one; nothing is changed until a state is chosen.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { SearchableBottomSheet } from '@/components/common/SearchableBottomSheet';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import type { ViewRef } from '@/types/nativeRefs';
import { INDIAN_STATES, stateDisplayName, stateMatchesSearch } from './indianStates';

/** One row of the sheet. `id` is the English name that is saved, or empty for "No state"; the list needs a non-empty key. */
interface StateRow {
  id: string;
  name: string;
  label: string;
}

const NO_STATE_KEY = '__none__';
const STATE_SHEET_SNAP_POINTS = ['90%', '95%'];

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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      minHeight: layout.rowMinHeight,
      paddingVertical: space.sm,
      paddingHorizontal: layout.marginCompact,
    },
    rowSelected: { backgroundColor: t.surface.selected },
    rowLabel: { ...typography.body, flex: 1, color: t.text.primary },
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

  // A saved text that is not on the list marks nothing; an empty State marks "No state".
  const selected = onList || !text ? text : null;
  const [lastQuery, setLastQuery] = useState('');

  // All states are held in the app: searching is a filter, in the English and the Gujarati name whatever the language.
  const searchFn = useCallback(async (query: string): Promise<StateRow[]> => {
    setLastQuery(query.trim());
    const noState: StateRow[] = query.trim() ? [] : [{ id: '', name: '', label: tr('gst.customer.noState') }];
    return [
      ...noState,
      ...INDIAN_STATES.filter((state) => stateMatchesSearch(state, query)).map((state) => ({
        id: state.name,
        name: state.name,
        label: stateDisplayName(state.name),
      })),
    ];
  }, []);

  const renderRow = useCallback(
    (row: StateRow, select: (row: StateRow) => void) => {
      const isSelected = row.id === selected;
      return (
        <Pressable
          onPress={() => select(row)}
          style={({ pressed }) => [styles.row, (isSelected || pressed) && styles.rowSelected]}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={row.label}
          testID={`customer-state-sheet-${row.id}`}
        >
          <Text style={styles.rowLabel} numberOfLines={2}>{row.label}</Text>
          {isSelected ? <Icon name="check" size={iconSize.md} color={t.brand.tint} /> : null}
        </Pressable>
      );
    },
    [selected, styles, t],
  );

  return (
    <View style={styles.field}>
      <Text style={[styles.label, !!error && styles.labelError]}>{tr('gst.customer.state')}</Text>
      <Pressable
        ref={boxRef}
        style={({ pressed }) => [styles.box, pressed && styles.boxPressed, !!error && styles.boxError]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${tr('gst.customer.state')}, ${text ? stateDisplayName(text) : tr('gst.customer.notChosen')}`}
        accessibilityHint={tr('gst.customer.chooseState')}
        testID="customer-state-picker"
      >
        <Text style={text ? styles.value : styles.placeholder} numberOfLines={2}>{text ? stateDisplayName(text) : tr('gst.customer.chooseState')}</Text>
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
        <SearchableBottomSheet<StateRow>
          isVisible
          onClose={() => setOpen(false)}
          onSelect={(row) => onChange(row.id)}
          title={tr('gst.customer.chooseState')}
          placeholder={tr('gst.customer.searchStates')}
          searchFn={searchFn}
          renderItem={renderRow}
          keyExtractor={(row) => row.id || NO_STATE_KEY}
          snapPoints={STATE_SHEET_SNAP_POINTS}
          minQueryLength={0}
          scrollToKey={selected === null ? undefined : selected || NO_STATE_KEY}
          emptySearchText={tr('gst.customer.noStateMatch', { search: lastQuery })}
        />
      ) : null}
    </View>
  );
}
