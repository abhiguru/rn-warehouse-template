/**
 * The short sheet a chip opens: one filter, or the sort (docs/STYLE_GUIDE.md §14.5).
 *
 * Sort and small choices apply on tap. Everything else is edited as a draft and
 * applied by the one button, which shows how many results it will give.
 */
import React, { useEffect, useState } from 'react';
import type { CountableFilterList } from '../configs';
import { isFieldActive } from '../filterModel';
import type { FilterValue, SortState } from '../types';
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

  // Start each visit from the value in effect.
  const fieldKey = field?.key;
  useEffect(() => {
    if (fieldKey) {
      setDraft(filters.values[fieldKey]);
      setInvalid(false);
    }
    // Only when a sheet opens, not on every value change behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <SheetFrame visible title="Sort by" onClose={onClose} closeLabel="Done">
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

  return (
    <SheetFrame
      visible
      title={field.label}
      onClose={onClose}
      tall={field.kind === 'picker'}
      action={{ label: 'Reset', onPress: () => setDraft(undefined), disabled: !isFieldActive(field, draft) }}
      footer={
        <ApplyFiltersButton
          result={result}
          noun={config.noun}
          disabled={invalid}
          onPress={() => {
            filters.setField(field.key, draft);
            onClose();
          }}
        />
      }
    >
      {/* Remount on Reset so editors that keep typed text start empty. */}
      <FieldEditor key={draft === undefined ? 'empty' : 'set'} field={field} value={draft} onChange={setDraft} ctx={filters.ctx} onInvalid={setInvalid} />
    </SheetFrame>
  );
}

export default SingleFilterSheet;
