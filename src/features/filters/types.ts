/**
 * List filter model (docs/STYLE_GUIDE.md §14.5).
 *
 * One list has one FilterListConfig. A field holds exactly one value, so one
 * field is one chip and counts once: a date range or a number range is a
 * single value, not two. Values are plain JSON; dates are local YYYY-MM-DD.
 */
import type { UserRole } from '@/types/user.types';
import type { IconName } from '@/types/icon.types';

export type SortOrder = 'asc' | 'desc';
export interface SortState {
  field: string;
  order: SortOrder;
}

export type DatePresetId =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  // A report's period (docs/STYLE_GUIDE.md §14.10).
  | 'last120'
  | 'last240'
  | 'last364'
  | 'last420'
  | 'thisFinancialYear';
/** A quick range offered as a chip. The label is a getter (docs/I18N.md rule 2). */
export interface DatePreset {
  id: DatePresetId;
  readonly label: string;
}
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
  /**
   * The facility is known to page the GRN list by receipt (backend migration 98), learned from its list
   * answers (`src/config/facilityGrnPaging.ts`). Absent or false until then.
   */
  pagesByReceipt?: boolean;
}

/**
 * Labels in a configuration follow the app's language: they are written as
 * getters (`get label() { return t('filters.field.date'); }`), so the text is
 * read when it is drawn and never stored (docs/I18N.md rule 2). Do not copy a
 * configuration with a spread: that would read the getters once and keep the
 * language of that moment.
 */
interface FieldBase {
  key: string;
  label: string;
  /** MaterialCommunityIcons name for the field's row and chip. */
  icon: IconName;
  /** Hide the field for some roles or accounts. Defaults to visible. */
  visibleTo?: (ctx: FilterContext) => boolean;
}
/** One choice of a choice field. */
export interface ChoiceOption {
  value: string;
  label: string;
  /**
   * Offer the choice only to some accounts or facilities. Defaults to offered. A stored value that is not
   * offered counts as no filter and is not sent.
   */
  visibleTo?: (ctx: FilterContext) => boolean;
}
export interface ChoiceField extends FieldBase {
  kind: 'choice';
  options: ChoiceOption[];
  /** The value that means "no filter". It is never stored. */
  defaultValue: string;
}
export interface ToggleField extends FieldBase {
  kind: 'toggle';
}
export interface DateRangeField extends FieldBase {
  kind: 'dateRange';
  /** The quick ranges offered. Defaults to the lists' own (`DATE_PRESETS`). */
  presets?: DatePreset[];
  /**
   * The range always has a value (a report's period). It is drawn next to the
   * sort chip without a remove target, is not counted as a filter, and
   * "Clear all" leaves it alone.
   */
  required?: boolean;
  /** A quick range applies on the tap and closes the sheet; typed days stay a draft. */
  applyPresetOnTap?: boolean;
  /**
   * Today for this range, as a Date whose local year, month and day are that day: the day the
   * list's own `toRequest` counts its quick ranges from, so the days the sheet shows are the days
   * the request sends. A report's period gives India's (`todayInIST`). Without it the phone's
   * own today is used, as the lists' requests use it.
   */
  today?: () => Date;
}
export interface NumberRangeField extends FieldBase {
  kind: 'numberRange';
  unit?: string;
  /** Whole numbers only (the backend column is an integer). */
  integer?: boolean;
  /**
   * The numbers are identifiers (invoice numbers), not quantities: shown as
   * written, in 0-9 and without a thousands separator (docs/I18N.md rule 5).
   */
  identifier?: boolean;
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
  /**
   * English noun of what is picked: ["customer", "customers"]. It is a key, not
   * a text: the singular selects the picker's texts (`filters.picker.<noun>`).
   */
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
  /** Decides the direction wording: newest first, highest number first, highest first (an amount), A to Z. */
  kind: 'date' | 'number' | 'amount' | 'text';
}

export interface SearchConfig {
  placeholder: string;
  /** Recognise dates typed into the search. */
  dates: boolean;
  /** Recognise a number range: document numbers ("A0010-A0020") or whole numbers ("10-20"). */
  range: 'document' | 'integer' | null;
  /** Recognise a financial year ("FY 2026"). */
  financialYear?: boolean;
  /** Field keys the recognised date, range and financial year are shown under. */
  dateField?: string;
  rangeField?: string;
  yearField?: string;
}

/** The parts of a list's configuration that do not depend on its request type. */
export interface FilterListDefinition {
  /** Key of this list's filters in the store. */
  listKey: string;
  /** Page title, e.g. "Filter GRNs". */
  title: string;
  /**
   * What the count counts, in English: ["item", "items"]. It is a key, not a
   * text: the singular selects the button texts (`filters.results.<noun>`).
   */
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
  /** Number of results for a request. Left out where nothing can count them: the button then reads "Show results". */
  fetchCount?: (request: TRequest, ctx: FilterContext) => Promise<number>;
}
