/** English text: filters. English is the source; src/i18n/locales/gu/filters.ts must have the same keys. */
export const filters = {
  // Field labels that are not in `common`
  field: {
    package: 'Package',
    bagsOnLine: 'Bags on a line',
    financialYear: 'Financial year',
    priceType: 'Price type',
    effectiveDate: 'Effective date',
    includeExpired: 'Include expired',
    withItems: 'With items',
  },
  option: {
    allYears: 'All years',
    oneTime: 'One-time',
    monthly: 'Monthly',
  },
  unit: {
    kg: 'kg',
    bags: 'bags',
  },
  placeholder: {
    packageName: 'Package name',
  },
  // Page titles and search placeholders, per list
  list: {
    grn: { title: 'Filter GRNs', search: 'Search GRNs' },
    dispatch: { title: 'Filter dispatches', search: 'Search dispatches' },
    invoice: { title: 'Filter invoices', search: 'Search invoices' },
    order: { title: 'Filter orders', search: 'Search orders' },
    queue: { title: 'Filter the queue', search: 'Search the queue' },
    price: { title: 'Filter prices' },
  },
  sort: {
    grnNumberChip: 'GRN no.',
    numberChip: 'Number',
    fallback: 'Sort',
  },
  sortDirection: {
    date: { desc: 'Newest first', asc: 'Oldest first' },
    number: { desc: 'Highest number first', asc: 'Lowest number first' },
    amount: { desc: 'Highest first', asc: 'Lowest first' },
    text: { desc: 'Z to A', asc: 'A to Z' },
  },
  // The same inside a sentence ("Sorted by Date, newest first").
  sortDirectionSpoken: {
    date: { desc: 'newest first', asc: 'oldest first' },
    number: { desc: 'highest number first', asc: 'lowest number first' },
    amount: { desc: 'highest first', asc: 'lowest first' },
    text: { desc: 'Z to A', asc: 'A to Z' },
  },
  preset: {
    today: 'Today',
    yesterday: 'Yesterday',
    last7: 'Last 7 days',
    thisMonth: 'This month',
    lastMonth: 'Last month',
  },
  // The apply button, per thing counted
  results: {
    showResults: 'Show results',
    item: { show: { one: 'Show {{count}} item', other: 'Show {{count}} items' }, none: 'No items match' },
    dispatch: { show: { one: 'Show {{count}} dispatch', other: 'Show {{count}} dispatches' }, none: 'No dispatches match' },
    invoice: { show: { one: 'Show {{count}} invoice', other: 'Show {{count}} invoices' }, none: 'No invoices match' },
    order: { show: { one: 'Show {{count}} order', other: 'Show {{count}} orders' }, none: 'No orders match' },
    price: { show: { one: 'Show {{count}} price', other: 'Show {{count}} prices' }, none: 'No prices match' },
  },
  // What a chip says for an active value
  chip: {
    dateBetween: '{{from}} – {{to}}',
    dateFrom: 'From {{date}}',
    dateUntil: 'Until {{date}}',
    numberBetween: '{{min}} – {{max}}',
    numberBetweenUnit: '{{min}} – {{max}} {{unit}}',
    atLeast: '{{min}} or more',
    atLeastUnit: '{{min}} {{unit}} or more',
    upTo: 'Up to {{max}}',
    upToUnit: 'Up to {{max}} {{unit}}',
    textBetween: '{{from}} – {{to}}',
    textFrom: 'From {{from}}',
    textUpTo: 'Up to {{to}}',
    text: '{{label}}: {{value}}',
    pickedMore: '{{first}} +{{more}}',
  },
  // The filter bar under the search field
  bar: {
    filters: 'Filters',
    openAll: 'Filters. Open sort and filter',
    openAllApplied: {
      one: 'Filters, {{count}} applied. Open sort and filter',
      other: 'Filters, {{count}} applied. Open sort and filter',
    },
    sortedBy: 'Sorted by {{label}}, {{direction}}. Change sort',
    activeChip: '{{label}}: {{value}}. Change',
    toggleOn: '{{label}}, on. Turn off',
    removeFilter: 'Remove filter {{name}}',
    removeFilterValue: 'Remove filter {{label}} {{value}}',
    searchDate: 'Date {{date}}, read from your search. Search for these words as text instead',
    removeSearchDate: 'Remove filter date {{date}} from your search',
    searchRange: 'Numbers {{from}} to {{to}}, read from your search. Search for these words as text instead',
    removeSearchRange: 'Remove filter number range {{from}} to {{to}} from your search',
    searchYear: 'Financial year {{year}}, read from your search. Search for these words as text instead',
    removeSearchYear: 'Remove filter financial year {{year}} from your search',
    filterBy: 'Filter by {{label}}',
    clearAllLabel: 'Clear all filters and the search',
  },
  header: {
    expandAll: {
      grn: 'Expand all GRNs',
      dispatch: 'Expand all dispatches',
      invoice: 'Expand all invoices',
      order: 'Expand all orders',
    },
    collapseAll: {
      grn: 'Collapse all GRNs',
      dispatch: 'Collapse all dispatches',
      invoice: 'Collapse all invoices',
      order: 'Collapse all orders',
    },
  },
  search: {
    searching: 'Searching',
    recent: 'Recent',
    searchAgain: 'Search again for {{text}}',
  },
  sheet: {
    sortBy: 'Sort by',
    order: 'Order',
    sortOrder: 'Sort order',
    closeScrim: '{{action}} {{title}}',
  },
  // The full "Sort and filter" page
  page: {
    title: 'Sort and filter',
    back: 'Back to sort and filter',
    close: 'Close without applying',
    resetLabel: 'Reset all filters and the sort on this page',
    sortByHeading: 'SORT BY',
    pickerRowSet: '{{label}}: {{value}}. Choose',
    pickerRowAny: '{{label}}: any. Choose',
    sectionWithUnit: '{{label}} ({{unit}})',
    noFilters: 'This list has no filters.',
    discardMessage: 'The filters you changed on this page have not been applied.',
  },
  date: {
    quickRanges: 'Quick date ranges',
    from: 'From',
    to: 'To',
    fromSet: 'From date, {{date}}',
    fromNotSet: 'From date, not set',
    toSet: 'To date, {{date}}',
    toNotSet: 'To date, not set',
  },
  // Ranges typed by hand: numbers and document numbers
  range: {
    from: 'From',
    to: 'To',
    minimum: 'Minimum',
    maximum: 'Maximum',
    cellLabel: '{{label}}, {{name}}',
    cellLabelUnit: '{{label}}, {{name}}, in {{unit}}',
    minAboveMax: 'The minimum is larger than the maximum.',
  },
  // Choosing customers or items from a long list
  picker: {
    selected: 'Selected ({{count}})',
    matches: 'Matches',
    customer: {
      search: 'Search customers',
      loadFailed: "Couldn't load customers. Check your connection and try again.",
      noMatch: 'No customers match "{{search}}".',
      typeToSearch: 'Type at least two letters to search customers.',
      done: 'Done choosing customers',
    },
    item: {
      search: 'Search items',
      loadFailed: "Couldn't load items. Check your connection and try again.",
      noMatch: 'No items match "{{search}}".',
      typeToSearch: 'Type at least two letters to search items.',
      done: 'Done choosing items',
    },
  },
  // A list that a search or filter narrowed to nothing
  empty: {
    noMatchSearch: {
      grn: 'No GRNs match "{{search}}"',
      dispatch: 'No dispatches match "{{search}}"',
      invoice: 'No invoices match "{{search}}"',
      order: 'No orders match "{{search}}"',
    },
    noMatchFilters: {
      grn: 'No GRNs match your filters',
      dispatch: 'No dispatches match your filters',
      invoice: 'No invoices match your filters',
      order: 'No orders match your filters',
    },
    searchHint: 'Check the spelling, try fewer words, or remove a filter.',
    filterHint: 'Try removing a filter or clearing them all.',
    clearSearchAndFilters: 'Clear search and filters',
    clearFilters: 'Clear filters',
  },
};
