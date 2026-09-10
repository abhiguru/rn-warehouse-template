/**
 * Item Form Sub-Components
 *
 * Decomposed from HorizontalItemForm.tsx for better maintainability.
 * Each component handles a specific section of the item entry form.
 *
 * @module features/grn/components/item-form
 */

// Hero banner with title and save button
export { HeroBanner, type HeroBannerProps } from './HeroBanner';

// Item search autocomplete field
export {
  ItemSearchField,
  type ItemSearchFieldProps,
  type ItemSearchResult,
} from './ItemSearchField';

// Quantity and weight input fields
export {
  QuantityWeightFields,
  type QuantityWeightFieldsRef,
  type QuantityWeightFieldsProps,
} from './QuantityWeightFields';

// Rack input with floor/chamber chip selectors
export {
  RackChamberPicker,
  type RackChamberPickerRef,
  type RackChamberPickerProps,
  // Utility exports
  parseRackValue,
  buildRackValue,
  FLOOR_OPTIONS,
  CHAMBER_OPTIONS,
} from './RackChamberPicker';

// Package mark field with image preview
export {
  MarkImageField,
  type MarkImageFieldRef,
  type MarkImageFieldProps,
} from './MarkImageField';
