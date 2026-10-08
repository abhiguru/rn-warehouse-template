# Generic Filter System

A comprehensive, type-safe, config-driven filter system for React Native with integrated autocomplete, Redux persistence, and auto-apply functionality.

## Features

- **Zero Boilerplate**: Configure filters with a simple object, get filtered results back
- **Fully Integrated Autocomplete**: Built-in search for Customer, Item, GRN, Dispatch, and Invoice
- **Redux Persistence**: Filter values persist across app sessions
- **Auto-Apply**: Debounced filter application (configurable delay)
- **Type-Safe**: Full TypeScript support with IDE autocomplete
- **Material Design 3**: Consistent styling across all filter components

## Supported Filter Types

1. **Text** - Single text input
2. **Number Range** - Min/max number inputs
3. **Date Range** - From/to date pickers
4. **Radio** - Single-select radio group
5. **Autocomplete** - Search with bottom sheet (Customer, Item, GRN, Dispatch, Invoice)

## Quick Start

### 1. Import the Component and Types

```typescript
import { GenericFilterModal, FilterConfig, useFilterState } from '@/components/filters';
```

### 2. Create Filter Configuration

```typescript
const filterConfig: FilterConfig = {
  persistKey: 'orders',      // Unique key for Redux persistence
  debounceMs: 500,           // Auto-apply delay (optional, default: 500)
  title: 'Order Filters',    // Modal title (optional, default: 'Filter')
  fields: [
    // Text input
    {
      type: 'text',
      key: 'itemName',
      label: 'Item Name',
      icon: '📦',
      placeholder: 'Search items...',
    },

    // Autocomplete with chips (Customer)
    {
      type: 'autocomplete',
      key: 'customer',
      label: 'Customer',
      icon: '👤',
      autocompleteType: 'customer',
      renderAsChips: true,
      multiSelect: false,
    },

    // Date range
    {
      type: 'date-range',
      key: ['dateFrom', 'dateTo'],
      label: 'Date Range',
      icon: '📅',
    },

    // Radio group
    {
      type: 'radio',
      key: 'status',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Pending', value: 'pending' },
        { label: 'Completed', value: 'completed' },
      ],
      defaultValue: 'all',
    },
  ],
};
```

### 3. Use in Component

```typescript
function OrdersScreen() {
  const [showFilter, setShowFilter] = useState(false);

  // Get filter values with auto-apply
  const { debouncedValues, activeFilterCount } = useFilterState({
    persistKey: 'orders',
    debounceMs: 500,
  });

  // Fetch data with filters
  useEffect(() => {
    fetchOrders(debouncedValues);
  }, [debouncedValues]);

  return (
    <>
      {/* Filter Button */}
      <Button onPress={() => setShowFilter(true)}>
        Filter {activeFilterCount > 0 && `(${activeFilterCount})`}
      </Button>

      {/* Filter Modal */}
      <GenericFilterModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        config={filterConfig}
      />

      {/* Orders List */}
      <OrderList data={orders} />
    </>
  );
}
```

## Complete Example: Order Filters

```typescript
import React, { useState, useEffect } from 'react';
import { View, Button } from 'react-native';
import { GenericFilterModal, FilterConfig, useFilterState } from '@/components/filters';
import { fetchOrders } from '@/services/order-service';

const orderFilterConfig: FilterConfig = {
  persistKey: 'customer-orders',
  debounceMs: 500,
  title: 'Order Filters',
  fields: [
    {
      type: 'text',
      key: 'itemName',
      label: 'Item Name',
      icon: '📦',
      placeholder: 'Enter item name...',
    },
    {
      type: 'text',
      key: 'grnNumber',
      label: 'GRN Number',
      icon: '📋',
      placeholder: 'Enter GRN number...',
    },
    {
      type: 'autocomplete',
      key: 'customer',
      label: 'Customer',
      icon: '👤',
      autocompleteType: 'customer',
      renderAsChips: true,
      multiSelect: false,
    },
    {
      type: 'autocomplete',
      key: 'items',
      label: 'Items',
      icon: '📦',
      autocompleteType: 'item',
      renderAsChips: true,
      multiSelect: true,  // Allow multiple item selection
    },
    {
      type: 'date-range',
      key: ['dateFrom', 'dateTo'],
      label: 'Date Range',
      icon: '📅',
      placeholder: ['From date', 'To date'],
    },
    {
      type: 'number-range',
      key: ['priceMin', 'priceMax'],
      label: 'Price Range',
      icon: '💰',
      placeholder: ['Min', 'Max'],
      minValue: 0,
      maxValue: 100000,
    },
    {
      type: 'radio',
      key: 'status',
      label: 'Status',
      options: [
        { label: 'All', value: 'all', description: 'Show all orders' },
        { label: 'Pending', value: 'pending', description: 'Orders awaiting processing' },
        { label: 'Completed', value: 'completed', description: 'Finished orders' },
      ],
      defaultValue: 'all',
    },
  ],
};

function OrdersScreen() {
  const [showFilter, setShowFilter] = useState(false);
  const [orders, setOrders] = useState([]);

  const { debouncedValues, activeFilterCount } = useFilterState({
    persistKey: 'customer-orders',
    debounceMs: 500,
  });

  useEffect(() => {
    async function loadOrders() {
      const result = await fetchOrders(debouncedValues);
      setOrders(result);
    }
    loadOrders();
  }, [debouncedValues]);

  return (
    <View>
      <Button onPress={() => setShowFilter(true)}>
        Filter {activeFilterCount > 0 && `(${activeFilterCount})`}
      </Button>

      <GenericFilterModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        config={orderFilterConfig}
      />

      {/* Render orders */}
    </View>
  );
}
```

## API Reference

### GenericFilterModal Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `visible` | `boolean` | Yes | Modal visibility state |
| `onClose` | `() => void` | Yes | Close handler |
| `config` | `FilterConfig` | Yes | Filter configuration |
| `onFilterChange` | `(values: FilterValues) => void` | No | Callback when filters change |

### FilterConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `persistKey` | `string` | Yes | Unique key for Redux persistence |
| `debounceMs` | `number` | No | Auto-apply delay (default: 500ms) |
| `title` | `string` | No | Modal title (default: 'Filter') |
| `fields` | `FilterFieldConfig[]` | Yes | Array of field configurations |

### Field Types

#### Text Field

```typescript
{
  type: 'text',
  key: string,
  label: string,
  icon?: string,
  placeholder?: string,
}
```

#### Number Range Field

```typescript
{
  type: 'number-range',
  key: [string, string],  // [minKey, maxKey]
  label: string,
  icon?: string,
  placeholder?: [string, string],
  minValue?: number,
  maxValue?: number,
}
```

#### Date Range Field

```typescript
{
  type: 'date-range',
  key: [string, string],  // [fromKey, toKey]
  label: string,
  icon?: string,
  placeholder?: [string, string],
}
```

#### Radio Field

```typescript
{
  type: 'radio',
  key: string,
  label: string,
  icon?: string,
  options: Array<{
    label: string,
    value: string,
    description?: string,
  }>,
  defaultValue?: string,
}
```

#### Autocomplete Field

```typescript
{
  type: 'autocomplete',
  key: string,
  label: string,
  icon?: string,
  placeholder?: string,
  autocompleteType: 'customer' | 'item' | 'grn' | 'dispatch' | 'invoice',
  renderAsChips?: boolean,
  multiSelect?: boolean,
  searchPlaceholder?: string,
}
```

### useFilterState Hook

```typescript
const {
  filterValues,      // Current filter values (immediate)
  debouncedValues,   // Debounced values (use for API calls)
  updateFilter,      // Update single field
  updateFilters,     // Update multiple fields
  clearFilter,       // Clear all filters
  clearAllFilters,   // Clear filters across all features
  removeField,       // Remove specific field
  activeFilterCount, // Count of active filters
  isReady,          // Persistence rehydration complete
} = useFilterState({
  persistKey: 'orders',
  debounceMs: 500,
  onFilterChange: (values) => console.log(values),
});
```

## Utility Functions

### transformFiltersForAPI

Convert filter values to API-friendly format:

```typescript
import { transformFiltersForAPI } from '@/components/filters';

const filterValues = {
  itemName: 'Rice',
  customer: [{ id: '123', label: 'Aarkay', type: 'customer' }],
  dateFrom: new Date('2025-01-01'),
};

const apiParams = transformFiltersForAPI(filterValues);
// Returns: { itemName: 'Rice', customerId: '123', dateFrom: '2025-01-01T00:00:00.000Z' }
```

### calculateActiveFilterCount

Count non-empty filters:

```typescript
import { calculateActiveFilterCount } from '@/components/filters';

const count = calculateActiveFilterCount(filterValues);
```

### Other Utilities

- `formatDateForDisplay(date)` - Format date for UI
- `formatDateForAPI(date)` - Convert date to ISO string
- `validateFilterValues(values, config)` - Validate filter values
- `cleanFilterValues(values)` - Remove empty values
- `initializeFilterValues(config)` - Get default values

## Autocomplete Types

The system supports 5 autocomplete types with fully integrated search:

1. **customer** - Search customers by name, mobile, city
2. **item** - Search GRN items by name, packaging
3. **grn** - Search GRN numbers
4. **dispatch** - Search dispatch numbers
5. **invoice** - Search invoice numbers

All autocomplete searches are:
- Debounced (300ms)
- Require minimum 2 characters
- Show loading states
- Handle empty states
- Support single/multi-select

## Migration Guide

### Before (Old Filter Pattern)

```typescript
// Lots of boilerplate...
const [showFilter, setShowFilter] = useState(false);
const [showAutocomplete, setShowAutocomplete] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const [searchResults, setSearchResults] = useState([]);
const [activeFilters, setActiveFilters] = useState({});

// Manual debouncing
useEffect(() => {
  const timer = setTimeout(() => {
    if (searchQuery.length >= 2) {
      searchCustomers(searchQuery).then(setSearchResults);
    }
  }, 300);
  return () => clearTimeout(timer);
}, [searchQuery]);

// Manual filter application
useEffect(() => {
  fetchOrders(activeFilters);
}, [activeFilters]);

// 100+ lines of JSX...
```

### After (Generic Filter)

```typescript
const filterConfig: FilterConfig = {
  persistKey: 'orders',
  fields: [
    { type: 'text', key: 'itemName', label: 'Item Name', icon: '📦' },
    { type: 'autocomplete', key: 'customer', label: 'Customer', autocompleteType: 'customer' },
  ],
};

function OrdersScreen() {
  const [showFilter, setShowFilter] = useState(false);
  const { debouncedValues } = useFilterState({ persistKey: 'orders' });

  useEffect(() => {
    fetchOrders(debouncedValues);
  }, [debouncedValues]);

  return (
    <>
      <Button onPress={() => setShowFilter(true)}>Filter</Button>
      <GenericFilterModal visible={showFilter} onClose={() => setShowFilter(false)} config={filterConfig} />
    </>
  );
}
```

**Result**: 60-70% code reduction!

## Architecture

```
src/components/filters/
├── GenericFilterModal.tsx           # Main modal component
├── AutocompleteBottomSheet.tsx      # Integrated autocomplete sheet
├── fields/
│   ├── TextFilterField.tsx
│   ├── NumberRangeFilterField.tsx
│   ├── DateRangeFilterField.tsx
│   ├── RadioFilterField.tsx
│   └── AutocompleteFilterField.tsx
└── index.ts

src/hooks/
└── useFilterState.ts                # State management hook

src/services/
└── filter-autocomplete-service.ts   # Unified autocomplete API

src/store/slices/
└── filterSlice.ts                   # Redux persistence

src/types/
└── filter.types.ts                  # TypeScript definitions

src/utils/
└── filterHelpers.ts                 # Utility functions
```

## Notes

- Filter values persist across app sessions via Redux + AsyncStorage
- Autocomplete searches are fully integrated - no additional code required
- All components use Material Design 3 styling
- Full TypeScript support with type inference
- Debouncing prevents excessive API calls
- Works seamlessly with existing Supabase services

## Support

For issues or questions, refer to the implementation in this README or check the inline documentation in the source files.
