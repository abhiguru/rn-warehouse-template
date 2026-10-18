/**
 * The "(all lines)" fields of a group: a row under the lines with its field in the Charge column
 * (table), or one block of inputs under the line cards (cards). A value typed here is applied to
 * every line that has not been given its own; "Mixed" says the lines differ.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { EditableNumberCell } from '@/components/table/EditableNumberCell';
import { useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { RateInput } from './RateInput';
import { touchTarget } from '@/theme/tokens';
import type { ItemsWidths } from './itemsLayout';
import {
  groupCellLabel,
  groupFieldKey,
  keepOwnNote,
  sharedLabel,
  type FieldState,
  type ItemsActions,
  type RateField,
  type SharedView,
} from './itemsModel';
import type { ItemsStyles } from './itemsStyles';
import { responderLog } from './responderLog';

interface FieldProps {
  groupKey: string;
  itemName: string;
  field: RateField;
  lines: number;
  oneTime: boolean;
  view: SharedView;
  state?: FieldState;
  /** The last field of the page: its keyboard key is "done", every other one's is "next". */
  lastKey?: string;
  actions: ItemsActions;
}

/** The text input itself is at least a touch target tall (the field's frame alone is not what a finger meets). */
const FIELD_INPUT = { minHeight: touchTarget };

interface RowProps extends FieldProps {
  widths: ItemsWidths;
  styles: ItemsStyles;
}

export const SharedRateRow = React.memo(function SharedRateRow({ groupKey, itemName, field, lines, oneTime, view, state, lastKey, widths, actions, styles }: RowProps) {
  const t = useTokens();
  const key = groupFieldKey(groupKey, field);
  const error = state?.shown ? state.error ?? undefined : undefined;
  return (
    <View style={[styles.side, styles.rowDivider]} testID={`shared-${groupKey}-${field}`}>
      <View style={styles.row} {...responderLog('shared')}>
        <Text style={styles.label} numberOfLines={2}>{sharedLabel(field, lines)}</Text>
        <EditableNumberCell
          key={key}
          ref={actions.refFor(key)}
          returnKeyType={key === lastKey ? 'done' : 'next'}
          value={state?.text ?? view.text}
          onChangeText={(text) => actions.change(key, text)}
          onHold={(held) => actions.hold(key, held)}
          onStart={() => actions.start(key)}
          onFocus={() => actions.focus(key)}
          onBlur={() => actions.blur(key)}
          onSubmitEditing={() => actions.submit(key)}
          placeholder={view.mixed ? tr('invoice.items.mixed') : '0'}
          placeholderTextColor={t.text.placeholder}
          label={groupCellLabel(field, itemName, oneTime)}
          error={error}
          width={widths.charge}
          testID={key}
        />
        <View style={{ width: widths.amount }} />
      </View>
      {view.keepOwn > 0 ? <Text style={styles.note}>{keepOwnNote(field, view.keepOwn)}</Text> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
});

interface BlockProps {
  groupKey: string;
  itemName: string;
  fields: RateField[];
  lines: number;
  oneTime: boolean;
  views: Record<RateField, SharedView>;
  charge?: FieldState;
  labour?: FieldState;
  tax?: FieldState;
  lastKey?: string;
  actions: ItemsActions;
  styles: ItemsStyles;
}

export const SharedBlock = React.memo(function SharedBlock({ groupKey, itemName, fields, lines, oneTime, views, charge, labour, tax, lastKey, actions, styles }: BlockProps) {
  const states = { charge, labour_rate: labour, tax };
  const t = useTokens();
  return (
    <View style={[styles.side, styles.rowDivider]} testID={`block-${groupKey}`}>
      <View style={styles.block}>
        {lines >= 2 ? <Text style={styles.blockTitle} accessibilityRole="header">{tr('invoice.items.allDispatches')}</Text> : null}
        {fields.map((field) => {
          const key = groupFieldKey(groupKey, field);
          const state = states[field];
          const view = views[field];
          return (
            <View key={field}>
              <RateInput
                key={key}
                ref={actions.refFor(key)}
                label={sharedLabel(field, lines)}
                numeric
                selectTextOnFocus
                keyboardType="decimal-pad"
                returnKeyType={key === lastKey ? 'done' : 'next'}
                inputStyle={FIELD_INPUT}
                value={state?.text ?? view.text}
                onChangeText={(text) => actions.change(key, text)}
                onFocus={() => actions.focus(key)}
                onBlur={() => actions.blur(key)}
                onSubmitEditing={() => actions.submit(key)}
                blurOnSubmit={false}
                placeholder={view.mixed ? tr('invoice.items.mixed') : '0'}
                placeholderTextColor={t.text.placeholder}
                helperText={view.keepOwn > 0 ? keepOwnNote(field, view.keepOwn) : undefined}
                error={state?.shown ? state.error ?? undefined : undefined}
                accessibilityLabel={groupCellLabel(field, itemName, oneTime)}
                testID={key}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
});
