/**
 * List filter model (docs/STYLE_GUIDE.md §14.5).
 *
 * One list has one FilterListConfig. A field holds exactly one value, so one
 * field is one chip and counts once: a date range or a number range is a
 * single value, not two. Values are plain JSON; dates are local YYYY-MM-DD.
 */
import type { UserRole } from '@/types/user.types';

export type SortOrder = 'asc' | 'desc';
export interface SortState {
  field: string;
  order: SortOrder;
}

export type DatePresetId = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';
/** A preset is resolved to dates when the request is built, so "Today" stays today. */
export interface DateRangeValue {
  preset?: DatePresetId;
  from?: string;
  to?: string;
}
export interface NumberRangeValue {
  min?: number;
  max?: number;
}
/** A range of document numbers, as typed. */
export interface TextRangeValue {
  from?: string;
  to?: string;
}
export interface PickedOption {
  id: string;
  label: string;
  detail?: string;
}

export type FilterValue =
  | string
  | boolean
  | DateRangeValue
  | NumberRangeValue
  | TextRangeValue
  | PickedOption[];
export type FilterValues = Record<string, FilterValue | undefined>;

/** Reserved keys in FilterValues for the quick search field. */
export const SEARCH_KEY = 'search';
/** Set when the user dismissed what the search recognised: treat every word as text. */
export const SEARCH_LITERAL_KEY = 'searchLiteral';

export interface FilterContext {
  role: UserRole | null;
  /** Admin, supervisor or staff. */
  isWarehouseRole: boolean;
  /** Customers a customer account may see. Empty for warehouse roles. */
  assignedCustomers: PickedOption[];
}

interface FieldBase {
  key: string;
  label: string;
  /** MaterialCommunityIcons name for the field's row and chip. */
  icon: string;
  /** Hide the field for some roles or accounts. Defaults to visible. */
  visibleTo?: (ctx: FilterContext) => boolean;
}
export interface ChoiceField extends FieldBase {
  kind: 'choice';
  options: { value: string; label: string }[];
  /** The value that means "no filter". It is never stored. */
  defaultValue: string;
}
export interface ToggleField extends FieldBase {
  kind: 'toggle';
}
export interface DateRangeField extends FieldBase {
  kind: 'dateRange';
}
export interface NumberRangeField extends FieldBase {
  kind: 'numberRange';
  unit?: string;
  /** Whole numbers only (the backend column is an integer). */
  integer?: boolean;
}
export interface TextRangeField extends FieldBase {
  kind: 'textRange';
  placeholder?: [string, string];
}
export interface TextField extends FieldBase {
  kind: 'text';
  placeholder?: string;
}
export interface PickerSource {
  /** Options before the user types. */
  initial: (ctx: FilterContext) => Promise<PickedOption[]>;
  /** Options for a search text of at least two characters. */
  search: (query: string, ctx: FilterContext) => Promise<PickedOption[]>;
}
export interface PickerField extends FieldBase {
  kind: 'picker';
  /** Noun for the search field and summaries: "customer", "item". */
  noun: [string, string];
  source: PickerSource;
}
export type FilterFieldDef =
  | ChoiceField
  | ToggleField
  | DateRangeField
  | NumberRangeField
  | TextRangeField
  | TextField
  | PickerField;

export interface SortFieldOption {
  field: string;
  label: string;
  /** Short label for the sort chip. Defaults to the label. */
  chipLabel?: string;
  /** Decides the direction wording: newest first, highest number first, A to Z. */
  kind: 'date' | 'number' | 'text';
}

export interface SearchConfig {
  placeholder: string;
  /** Recognise dates typed into the search. */
  dates: boolean;
  /** Recognise a number range: document numbers ("A0010-A0020") or whole numbers ("10-20"). */
  range: 'document' | 'integer' | null;
  /** Field keys the recognised date and range are shown under. */
  dateField?: string;
  rangeField?: string;
}

/** The parts of a list's configuration that do not depend on its request type. */
export interface FilterListDefinition {
  /** Key of this list's filters in the store. */
  listKey: string;
  /** Page title, e.g. "Filter GRNs". */
  title: string;
  /** What the count counts: ["item", "items"]. */
  noun: [string, string];
  search?: SearchConfig;
  sort?: { options: SortFieldOption[]; default: SortState };
  fields: FilterFieldDef[];
  /** Keys of the fields that always show as chips, in order. */
  fastFilters: string[];
}

export interface FilterListConfig<TRequest = unknown> extends FilterListDefinition {
  /**
   * The request for these filters. Pure. The list and the result count both
   * call it, so a field cannot be shown without being sent.
   */
  toRequest: (values: FilterValues, sort: SortState | undefined, ctx: FilterContext, today?: Date) => TRequest;
  /** Number of results for a request. */
  fetchCount: (request: TRequest, ctx: FilterContext) => Promise<number>;
}
