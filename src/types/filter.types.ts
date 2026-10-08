/**
 * Generic Filter System Type Definitions
 *
 * Provides type-safe configuration for dynamic filter components
 * with support for text, number ranges, date ranges, radio buttons,
 * and fully integrated autocomplete functionality.
 */

// ============================================================================
// AUTOCOMPLETE TYPES
// ============================================================================

/**
 * Supported autocomplete types for filter fields
 */
export type AutocompleteType =
  | 'customer'
  | 'item'
  | 'grn'
  | 'dispatch'
  | 'invoice';

/**
 * Selected autocomplete item structure
 */
export interface AutocompleteSelection {
  id: string;           // Unique identifier
  label: string;        // Display label
  detail?: string;      // Additional detail text
  type: AutocompleteType;
  metadata?: any;       // Raw data from API (for submission)
}

/**
 * Autocomplete search result from service layer
 */
export interface AutocompleteResult {
  id: string;
  label: string;
  detail?: string;
  type: AutocompleteType;
  metadata?: any;
}

// ============================================================================
// FILTER FIELD TYPES
// ============================================================================

/**
 * All supported filter field types
 */
export type FilterFieldType =
  | 'text'           // Single text input
  | 'number-range'   // Min/max number inputs
  | 'date-range'     // From/to date pickers
  | 'radio'          // Single-select radio group
  | 'autocomplete';  // Search with bottom sheet

/**
 * Base configuration shared by all field types
 */
interface BaseFieldConfig {
  type: FilterFieldType;
  label: string;
  icon?: string;  // Emoji or icon name
}

/**
 * Text input field configuration
 */
export interface TextFieldConfig extends BaseFieldConfig {
  type: 'text';
  key: string;
  placeholder?: string;
}

/**
 * Number range field configuration (min/max)
 */
export interface NumberRangeFieldConfig extends BaseFieldConfig {
  type: 'number-range';
  key: [string, string];  // [minKey, maxKey]
  placeholder?: [string, string];  // [minPlaceholder, maxPlaceholder]
  minValue?: number;  // Optional minimum constraint
  maxValue?: number;  // Optional maximum constraint
}

/**
 * Date range field configuration (from/to)
 */
export interface DateRangeFieldConfig extends BaseFieldConfig {
  type: 'date-range';
  key: [string, string];  // [fromKey, toKey]
  placeholder?: [string, string];  // [fromPlaceholder, toPlaceholder]
}

/**
 * Radio button option
 */
export interface RadioOption {
  label: string;
  value: string;
  description?: string;  // Optional description text
}

/**
 * Radio group field configuration
 */
export interface RadioFieldConfig extends BaseFieldConfig {
  type: 'radio';
  key: string;
  options: RadioOption[];
  defaultValue?: string;  // Default selected value
}

/**
 * Autocomplete field configuration
 */
export interface AutocompleteFieldConfig extends BaseFieldConfig {
  type: 'autocomplete';
  key: string;
  autocompleteType: AutocompleteType;
  placeholder?: string;
  renderAsChips?: boolean;  // Display selections as removable chips
  multiSelect?: boolean;    // Allow multiple selections
  searchPlaceholder?: string;  // Placeholder for search input
}

/**
 * Union type of all field configurations
 */
export type FilterFieldConfig =
  | TextFieldConfig
  | NumberRangeFieldConfig
  | DateRangeFieldConfig
  | RadioFieldConfig
  | AutocompleteFieldConfig;

// ============================================================================
// FILTER CONFIGURATION
// ============================================================================

/**
 * Complete filter configuration for a feature/screen
 */
export interface FilterConfig {
  /**
   * Unique key for Redux persistence (e.g., 'orders', 'grn', 'dispatch')
   * Each feature should have its own persist key
   */
  persistKey: string;

  /**
   * Debounce delay in milliseconds for auto-apply
   * @default 500
   */
  debounceMs?: number;

  /**
   * Array of filter field configurations
   */
  fields: FilterFieldConfig[];

  /**
   * Optional title override for filter modal
   * @default "Filter"
   */
  title?: string;
}

// ============================================================================
// FILTER VALUES
// ============================================================================

/**
 * Valid filter value types
 * - string: text input, radio selection, ISO date string
 * - number: number range min/max values
 * - Date: date values (serialized to ISO string for Redux persistence)
 * - AutocompleteSelection[]: autocomplete selections
 * - undefined: cleared/empty filter
 *
 * Note: While Date objects are valid in component state, they are serialized
 * to ISO strings when stored in Redux for persistence compatibility.
 */
export type FilterValueType =
  | string
  | number
  | Date
  | AutocompleteSelection[]
  | undefined;

/**
 * Filter values object - dynamically typed based on configuration
 * Keys correspond to field keys in the config
 * Values can be:
 * - string (text, radio, ISO date string)
 * - number (number range min/max)
 * - Date (date values, serialized to ISO string for persistence)
 * - AutocompleteSelection[] (autocomplete)
 * - undefined (cleared filter)
 *
 * Note: Uses 'any' for backwards compatibility. Use type guards
 * (isAutocompleteSelection, getStringValue, getNumberValue, etc.)
 * to narrow types when accessing filter values.
 */
export type FilterValues = Record<string, any>;

/**
 * Type guard to check if a value is an autocomplete selection array
 */
export function isAutocompleteSelection(
  value: FilterValueType
): value is AutocompleteSelection[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        typeof item === 'object' &&
        'id' in item &&
        'label' in item &&
        'type' in item
    )
  );
}

/**
 * Type guard to check if a value is a string
 */
export function isStringFilterValue(
  value: FilterValueType
): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a number
 */
export function isNumberFilterValue(
  value: FilterValueType
): value is number {
  return typeof value === 'number';
}

/**
 * Type guard to check if a value is a Date
 */
export function isDateFilterValue(
  value: FilterValueType
): value is Date {
  return value instanceof Date;
}

/**
 * Helper to safely get autocomplete selections from filter values
 * Returns empty array if value is not an autocomplete selection array
 */
export function getAutocompleteSelections(
  value: FilterValueType
): AutocompleteSelection[] {
  return isAutocompleteSelection(value) ? value : [];
}

/**
 * Helper to safely get string value from filter values
 * Returns undefined if value is not a string
 */
export function getStringValue(
  value: FilterValueType
): string | undefined {
  return isStringFilterValue(value) ? value : undefined;
}

/**
 * Helper to safely get number value from filter values
 * Returns undefined if value is not a number
 */
export function getNumberValue(
  value: FilterValueType
): number | undefined {
  return isNumberFilterValue(value) ? value : undefined;
}

// ============================================================================
// FILTER STATE (Redux)
// ============================================================================

/**
 * Redux state shape for filters
 * Each feature (persistKey) has its own filter values object
 */
export interface FilterState {
  filters: Record<string, FilterValues>;
}

/**
 * Initial filter state
 */
export const initialFilterState: FilterState = {
  filters: {},
};

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/**
 * Props for GenericFilterModal component
 */
export interface GenericFilterModalProps {
  visible: boolean;
  onClose: () => void;
  config: FilterConfig;
  onFilterChange?: (values: FilterValues) => void;  // Optional callback for filter changes
  // Additional props for external filter state management
  values?: FilterValues;
  onUpdateFilter?: (field: string, value: any) => void;
  onClearAll?: () => void;
  activeFilterCount?: number;
}

/**
 * Props for field components
 */
export interface TextFilterFieldProps {
  label: string;
  icon?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
}

export interface NumberRangeFilterFieldProps {
  label: string;
  icon?: string;
  placeholder?: [string, string];
  minValue?: number;
  maxValue?: number;
  value: [number | undefined, number | undefined];
  onChange: (min: number | undefined, max: number | undefined) => void;
}

export interface DateRangeFilterFieldProps {
  label: string;
  icon?: string;
  placeholder?: [string, string];
  value: [Date | undefined, Date | undefined];
  onChange: (from: Date | undefined, to: Date | undefined) => void;
}

export interface RadioFilterFieldProps {
  label: string;
  icon?: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
}

export interface AutocompleteFilterFieldProps {
  label: string;
  icon?: string;
  placeholder?: string;
  autocompleteType: AutocompleteType;
  value: AutocompleteSelection[];
  onPress: () => void;
  onRemoveSelection?: (id: string) => void;
  inlineChips?: boolean;  // Display chips inline instead of below
}

/**
 * Props for AutocompleteBottomSheet component
 */
export interface AutocompleteBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  autocompleteType: AutocompleteType;
  multiSelect: boolean;
  currentSelections: AutocompleteSelection[];
  onSelect: (selections: AutocompleteSelection[]) => void;
  searchPlaceholder?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract filter values type from a specific config
 * Useful for type-safe filter value objects
 *
 * Note: This is a complex utility type and currently commented out
 * due to TypeScript limitations with union types in mapped types.
 * Filter values should use the FilterValues type directly.
 */
// export type ExtractFilterValues<T extends FilterConfig> = {
//   [K in T['fields'][number]['key']]: K extends string
//     ? any  // For single keys
//     : never;  // For tuple keys (handled separately)
// };

/**
 * Active filter count by field type
 */
export interface FilterCountBreakdown {
  text: number;
  numberRange: number;
  dateRange: number;
  radio: number;
  autocomplete: number;
  total: number;
}
