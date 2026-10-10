/** The editor for one filter field, whatever its kind. Used by the single-filter sheet and the full page. */
import React from 'react';
import type {
  DateRangeValue,
  FilterContext,
  FilterFieldDef,
  FilterValue,
  NumberRangeValue,
  PickedOption,
  TextRangeValue,
} from '../types';
import { ChoiceChips } from './ChoiceChips';
import { DateRangeEditor } from './editors/DateRangeEditor';
import { OptionPicker } from './editors/OptionPicker';
import { NumberRangeEditor, TextEditor, TextRangeEditor } from './editors/RangeEditors';

export interface FieldEditorProps {
  field: FilterFieldDef;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
  ctx: FilterContext;
  onInvalid?: (invalid: boolean) => void;
}

export function FieldEditor({ field, value, onChange, ctx, onInvalid }: FieldEditorProps) {
  switch (field.kind) {
    case 'choice':
      return (
        <ChoiceChips
          accessibilityLabel={field.label}
          options={field.options}
          value={typeof value === 'string' ? value : field.defaultValue}
          onChange={onChange}
        />
      );
    case 'toggle':
      return (
        <ChoiceChips
          accessibilityLabel={field.label}
          options={[{ value: 'off', label: 'All' }, { value: 'on', label: field.label }]}
          value={value === true ? 'on' : 'off'}
          onChange={next => onChange(next === 'on' ? true : undefined)}
        />
      );
    case 'dateRange':
      return <DateRangeEditor value={value as DateRangeValue | undefined} onChange={onChange} />;
    case 'numberRange':
      return (
        <NumberRangeEditor
          label={field.label}
          value={value as NumberRangeValue | undefined}
          onChange={onChange}
          unit={field.unit}
          integer={field.integer}
          onInvalid={onInvalid}
        />
      );
    case 'textRange':
      return (
        <TextRangeEditor label={field.label} value={value as TextRangeValue | undefined} onChange={onChange} placeholder={field.placeholder} />
      );
    case 'text':
      return <TextEditor label={field.label} value={typeof value === 'string' ? value : undefined} onChange={onChange} placeholder={field.placeholder} />;
    case 'picker':
      return <OptionPicker field={field} value={Array.isArray(value) ? (value as PickedOption[]) : []} onChange={onChange} ctx={ctx} />;
  }
}

export default FieldEditor;
