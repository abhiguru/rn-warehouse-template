/** English text: orders. English is the source; src/i18n/locales/gu/orders.ts must have the same keys. */
export const orders = {
  // The order screen of one customer.
  screen: {
    title: 'Order for {{name}}',
    viewHistory: 'View order history',
    // Under "Order for …": the order's number (an identifier, 0-9).
    orderNumber: 'Order {{number}}',
    addItemsToOrder: 'Add items to order',
    historyError: "Couldn't load the order history. Check your connection and try again.",
  },
  // What a save does to customers' open orders (shown before and after a dispatch or GRN is saved or a GRN is deleted).
  effect: {
    // Heading of the note on a Review step.
    noticeTitle: 'These orders change when you save',
    // Added to the question before a save.
    questionLead: 'This also changes orders:',
    checking: 'Checking orders…',
    // Added to the message after a save.
    doneLead: 'Orders changed:',
    orderOf: "{{name}}'s order",
    // A name that ends in s takes only the apostrophe.
    orderOfS: "{{name}}' order",
    // {{from}} → {{count}} bags: the line's old and new quantity.
    reduced: { one: '{{order}}: {{item}} ({{grn}}) {{from}} → {{count}} bag', other: '{{order}}: {{item}} ({{grn}}) {{from}} → {{count}} bags' },
    increased: { one: '{{order}}: {{item}} ({{grn}}) {{from}} → {{count}} bag', other: '{{order}}: {{item}} ({{grn}}) {{from}} → {{count}} bags' },
    added: { one: '{{order}}: {{item}} ({{grn}}) is added, {{count}} bag', other: '{{order}}: {{item}} ({{grn}}) is added, {{count}} bags' },
    removed: '{{item}} ({{grn}}) is removed from {{order}}.',
    removedLast: '{{item}} ({{grn}}) is removed from {{order}}. No line is left, so the order is removed.',
    exceedsStock: {
      one: '{{order}}: {{item}} ({{grn}}) asks for {{wanted}} bags, but only {{count}} bag will be in stock.',
      other: '{{order}}: {{item}} ({{grn}}) asks for {{wanted}} bags, but only {{count}} bags will be in stock.',
    },
  },
  manage: {
    loading: 'Loading order…',
    loadingLabel: 'Loading order',
    couldNotOpenTitle: "Couldn't open the order",
    couldNotOpenMessage: "Couldn't open the order. Check your connection and try again.",
    businessInactive: 'This business is no longer active. Ask your cold storage.',
    businessDeactivatedStaff: 'This business is deactivated. Turn it on in Customers to take orders.',
    deactivatedTitle: 'Deactivated at the cold storage',
    deactivatedCustomer: 'You can still order your goods out.',
    deactivatedStaff: 'No new goods are taken in. Turn it on in Customers to change that.',
    couldNotLoadTitle: "Couldn't load the order",
    couldNotChangeQuantityTitle: "Couldn't change the quantity",
    removeTitle: 'Remove {{name}}?',
    removeMessage: '{{name}} will be taken off this order.',
    removeTitleNoName: 'Remove this item?',
    removeMessageNoName: 'this item will be taken off this order.',
    removeItem: 'Remove item',
    couldNotRemoveTitle: "Couldn't remove the item",
    // A line that is no longer on the order when it is changed or removed (taken off or dispatched by someone else).
    lineGoneTitle: 'This item is no longer on the order',
    lineGoneMessage: 'Someone else removed it, or it was dispatched. The order is shown again as it is now.',
    // The answer to a change of a line was lost; the line was checked and the server did not apply it.
    lostAnswerNotSaved: 'The server did not save the change. The order shows what is saved now.',
    lostAnswerNotRemoved: 'The server did not remove the item. It is still on the order.',
    emptyTitle: 'No items in this order',
    emptyMessage: "Items you add from this customer's stock appear here.",
    labelDetail: '{{label}}, {{detail}}',
  },
  // One line of the order, with its quantity stepper.
  item: {
    saved: 'Saved',
    qty: 'Qty',
    noMark: 'No mark',
    addAmount: 'Add {{amount}} to {{name}}',
    removeAmount: 'Remove {{amount}} from {{name}}',
    increase: 'Increase {{name}} by {{amount}}',
    decrease: 'Decrease {{name}} by {{amount}}',
    removeFromOrder: 'Remove {{name}} from order',
    quantity: 'Quantity {{quantity}}',
    quantitySaving: 'Quantity {{quantity}}, saving',
    quantitySaved: 'Quantity {{quantity}}, saved',
    // The line asks for more than the lot has now; {{stock}} is the stock. It can be lowered to that or removed.
    // `onlyInStock` is the short form (a row of the Add items sheet); `overStock` is the warning on the order line.
    onlyInStock: 'Only {{stock}} in stock',
    overStock: 'Only {{stock}} in stock. Lower it to {{stock}} or less, or remove it.',
    // The spoken label of − and −10 on a line above its stock: they lower it ({{quantity}} is the quantity it gets, at most the
    // stock); with no stock left they ask to remove it.
    lowerTo: 'Lower {{name}} to {{quantity}}',
  },
  // What the server's refusals say on the order screen (wave B, owner decision D1).
  refusal: {
    // Someone else changed the line after this screen read it; nothing was saved. {{current}} and {{chosen}} are bags.
    staleTitle: 'Someone else changed this order line',
    stale: 'It now shows {{current}}. You wanted {{chosen}}. Change it again if you still want that.',
    staleRemove: 'Someone else changed this order line, so it was not removed. Check it and try again.',
  },
  quickAdd: {
    select: 'Select {{name}}',
    loadingRecent: 'Loading recent items',
  },
  // The sheet for choosing stock items and their quantities.
  catalog: {
    addItems: 'Add items',
    cancelAdding: 'Cancel adding items',
    addCountToOrder: 'Add {{items}} to order',
    addCount: 'Add ({{count}})',
    couldNotLoadTitle: "Couldn't load items",
    noneSelectedTitle: 'No items selected',
    noneSelectedMessage: 'Choose a quantity for at least one item, then tap Add.',
    searchLabel: 'Search stock items',
    searchPlaceholderHint: 'Search by name, mark or weight, e.g. 10-20',
    searchItems: 'Search items',
    resultsByWeight: '{{shown}} of {{total}} by weight',
    resultsByName: '{{shown}} of {{total}} by name/package',
    rowMark: 'mark {{mark}}',
    grn: 'GRN {{number}}',
    rowStock: '{{status}}, {{current}} of {{total}}',
    rowAlreadyInOrder: 'already in order',
    rowSelected: '{{bags}} selected',
    inOrder: 'In order',
    ofTotal: 'of {{total}}',
    addBags: { one: 'Add {{count}} bag of {{name}}', other: 'Add {{count}} bags of {{name}}' },
    removeBags: { one: 'Remove {{count}} bag of {{name}}', other: 'Remove {{count}} bags of {{name}}' },
    selectedOf: '{{bags}} of {{name}} selected',
    noStockForTitle: 'No stock available for "{{search}}"',
    noStockForMessage: 'Try fewer letters, another package mark or a weight range such as 10-20.',
    emptyTitle: 'No items in stock',
    emptyMessage: "Items from this customer's GRNs appear here while they have stock.",
    loadingMore: 'Loading more items…',
    catalogName: 'Catalog {{name}}',
    allCatalogs: 'All catalogs',
    // Leaving with selections that were not added.
    discardTitle: 'Discard selections?',
    discardMessage: {
      one: 'Changes to {{count}} lot have not been saved.',
      other: 'Changes to {{count}} lots have not been saved.',
    },
    discardSelections: 'Discard selections',
    // The same question when Add would send something: it lists the changes and offers Add to order.
    addChangesTitle: 'Add these changes to the order?',
    addToOrder: 'Add to order',
    // One line per changed lot; {{lot}} is "name · mark · GRN · weight", {{count}} the bags after the change.
    // The changed quantity is in words, not "→", so a screen reader says it right.
    changeAdd: { one: '{{lot}} — add {{count}} bag', other: '{{lot}} — add {{count}} bags' },
    changeSet: { one: '{{lot}} — from {{from}} to {{count}} bag', other: '{{lot}} — from {{from}} to {{count}} bags' },
    // {{count}} is the bags on the order that would be taken off.
    changeRemove: { one: '{{lot}} — remove ({{count}} bag)', other: '{{lot}} — remove ({{count}} bags)' },
    // Last line of the question when Add is not offered (every lot already on the order was taken off, none chosen).
    discardOnlyNote: 'Discard keeps the order as it is. To take every lot off, remove the lines on the order page.',
    // Add waits for the server; a lot that was not saved keeps its reason.
    savingProgress: 'Saving {{done}} of {{total}}…',
    notSavedSummary: {
      one: '{{count}} lot was not saved. See the reason on it.',
      other: '{{count}} lots were not saved. See the reason on each.',
    },
    reasonStock: 'Only {{bags}} in stock.',
    reasonAlreadyInOrder: 'This lot is already in the order.',
    reasonBelowDispatched: '{{bags}} already dispatched. Choose that many or more.',
    reasonOrderClosed: 'This order is closed. Go back and open it again.',
    reasonNotSaved: 'Not saved. Check your connection and try again.',
    // The line the lot was saved on is no longer on the order.
    reasonLineGone: 'This item is no longer on the order.',
    // Someone else changed the lot while the picker was open; nothing was overwritten.
    reasonChangedMeanwhile: 'Changed by someone else: now {{bags}} in the order. Tap Add again to make it {{chosen}}.',
    reasonRemovedMeanwhile: 'Removed by someone else. Tap Add again to add {{chosen}}.',
    reasonChangedMeanwhileRemove: 'Changed by someone else: now {{bags}} in the order. Tap Add again to remove it.',
    // The answer was lost, the lot was locked while the order was read again, and the server's state is not what was asked.
    // Nothing is sent again by itself: the person taps Add.
    reasonCheckedNotSaved: 'Checked: it was not saved. Tap Add again to add {{chosen}}.',
    reasonCheckedOther: 'Checked: the order has {{bags}} now. Tap Add again to make it {{chosen}}.',
    reasonCheckedNotRemoved: 'Checked: it was not removed. Tap Add again to remove it.',
    // The lot's line is being checked after an answer of its own card was lost; nothing was sent for it.
    reasonLineChecking: 'This item is still being checked. Tap Add again in a moment.',
    // Leaving the picker while a lot's answer is being checked (X only).
    leaveCheckingTitle: 'Leave while checking?',
    keepWaiting: 'Keep waiting',
    leaveAnyway: 'Leave anyway',
  },
};
