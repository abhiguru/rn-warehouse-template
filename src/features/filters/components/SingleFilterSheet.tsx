/**
 * The short sheet a chip opens: one filter, or the sort (docs/STYLE_GUIDE.md §14.5).
 *
 * Sort and small choices apply on tap. Everything else is edited as a draft and
 * applied by the one button, which shows how many results it will give.
 */
import React, { useEffect, useState } from 'react';
import { t } from '@/i18n';
import type { CountableFilterList } from '../configs';
import { resolveDateRange } from '../datePresets';
import { isFieldActive, isRequiredField } from '../filterModel';
import type { DateRangeValue, FilterValue, SortState } from '../types';
import { useFilterResultCount } from '../useFilterResultCount';
import type { useListFilters } from '../useListFilters';
import { ApplyFiltersButton } from './ApplyFiltersButton';
import { SortEditor } from './editors/SortEditor';
import { FieldEditor } from './FieldEditor';
import { SheetFrame } from './SheetFrame';

export type OpenFilter = { type: 'sort' } | { type: 'field'; key: string } | null;

export interface SingleFilterSheetProps {
  config: CountableFilterList;
  filters: ReturnType<typeof useListFilters>;
  open: OpenFilter;
  onClose: () => void;
}

export function SingleFilterSheet({ config, filters, open, onClose }: SingleFilterSheetProps) {
  const field = open?.type === 'field' ? filters.fields.find(candidate => candidate.key === open.key) : undefined;
  const [draft, setDraft] = useState<FilterValue | undefined>(undefined);
  const [invalid, setInvalid] = useState(false);
  // Counts presses of Reset: editors that keep typed text remount then, and only then.
  const [resets, setResets] = useState(0);

  // Start each visit from the value in effect.
  const fieldKey = field?.key;
  useEffect(() => {
    if (fieldKey) {
      setDraft(filters.values[fieldKey]);
      setInvalid(false);
      // The editor was first drawn with the previous draft: rebuild it so typed-text fields show this value.
      setResets(count => count + 1);
    }
    // Only when a sheet opens, not on every value change behind it.
     
  }, [fieldKey]);

  const needsApply = Boolean(field && field.kind !== 'choice' && field.kind !== 'toggle');
  const result = useFilterResultCount(
    config,
    field ? { ...filters.values, [field.key]: draft } : filters.values,
    filters.sort,
    filters.ctx,
    needsApply
  );

  if (open?.type === 'sort' && config.sort && filters.sort) {
    return (
      <SheetFrame visible title={t('filters.sheet.sortBy')} onClose={onClose} closeLabel={t('common.done')}>
        <SortEditor options={config.sort.options} value={filters.sort} onChange={(sort: SortState) => filters.setSort(sort)} />
      </SheetFrame>
    );
  }
  if (!field) return null;

  if (!needsApply) {
    return (
      <SheetFrame visible title={field.label} onClose={onClose}>
        <FieldEditor
          field={field}
          value={filters.values[field.key]}
          ctx={filters.ctx}
          onChange={value => {
            filters.setField(field.key, value);
            onClose();
          }}
        />
      </SheetFrame>
    );
  }

  const required = isRequiredField(field);
  // A required range needs both of its days before it can replace the one in effect. They are
  // counted from the field's own today, as the editor counts the days it shows (a report's period:
  // India's today). Only whether both are there is asked, so the answer is the same on any day.
  const today = field.kind === 'dateRange' ? field.today?.() : undefined;
  const draftRange = required ? resolveDateRange(draft as DateRangeValue | undefined, today) : undefined;
  const incomplete = required && !(draftRange?.from && draftRange.to);
  const change = (value: FilterValue | undefined) => {
    // A quick range of a field that asks for it applies on the tap, like a choice; typed days stay a draft.
    if (field.kind === 'dateRange' && field.applyPresetOnTap && (value as DateRangeValue | undefined)?.preset) {
      filters.setField(field.key, value);
      onClose();
      return;
    }
    setDraft(value);
  };

  return (
    <SheetFrame
      visible
      title={field.label}
      onClose={onClose}
      tall={field.kind === 'picker'}
      // A required range has nothing to reset to.
      action={required ? undefined : { label: t('common.reset'), onPress: () => { setDraft(undefined); setInvalid(false); setResets(count => count + 1); }, disabled: !isFieldActive(field, draft) }}
      footer={
        <ApplyFiltersButton
          result={result}
          noun={config.noun}
          disabled={incomplete}
          blockedMessage={invalid ? t('filters.range.minAboveMax') : undefined}
          onPress={() => {
            filters.setField(field.key, draft);
            onClose();
          }}
        />
      }
    >
      {/* Remount on Reset so editors that keep typed text start empty; never while typing, which would drop the focus. */}
      <FieldEditor key={resets} field={field} value={draft} onChange={change} ctx={filters.ctx} onInvalid={setInvalid} />
    </SheetFrame>
  );
}

export default SingleFilterSheet;
