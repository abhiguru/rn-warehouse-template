/**
 * The customer's State, picked from the list of Indian states and union territories (WH-151, backend migration 173): the name
 * picked is saved, and the server derives the state code from it (and uses the GSTIN's first two digits when there is one) to
 * decide CGST and SGST or IGST. A state typed before as free text that is not on the list is shown as it was saved, with a note
 * to choose one; nothing is changed until a state is chosen.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { PreferenceSheet, type PreferenceOption } from '@/features/settings/components/PreferenceSheet';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
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
    boxError: { borderColor: t.status.negative.border, borderWidth: 2 },
    value: { ...typography.body, color: t.text.primary, flex: 1 },
    placeholder: { ...typography.body, color: t.text.placeholder, flex: 1 },
    note: { ...typography.footnote, color: t.text.secondary },
    errorText: { ...typography.footnote, color: t.status.negative.text },
  });

interface Props {
  /** The state as saved (free text or a name from the list). */
  value: string;
  onChange: (name: string) => void;
  error?: string;
}

export function CustomerStatePicker({ value, onChange, error }: Props) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [open, setOpen] = useState(false);
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
        style={[styles.box, !!error && styles.boxError]}
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
        <Text style={styles.errorText}>{error}</Text>
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
