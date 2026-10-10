/** English text: nav. English is the source; src/i18n/locales/gu/nav.ts must have the same keys. */
export const nav = {
  loading: 'Loading',
  // Bottom tabs
  tabs: {
    orders: 'Orders',
    grn: 'GRN',
    dispatch: 'Dispatch',
    invoices: 'Invoices',
    reports: 'Reports',
  },
  // The Orders | Queue switch on the Orders tab
  ordersView: {
    orders: 'Orders',
    queue: 'Queue',
  },
  // Stack screen titles
  screens: {
    signIn: 'Sign in',
    enterCode: 'Enter code',
    waitingForApproval: 'Waiting for approval',
    facility: 'Facility',
    enrollmentReview: 'Enrollment review',
    editGrn: 'Edit GRN',
  },
  // Starting the app against the chosen facility server
  bootstrap: {
    unreachable: "Couldn't reach the facility server. Check your connection and try again.",
    connectFailed: "Couldn't connect to the facility server. Try again, or choose another server.",
    verifyFailed: "Couldn't verify the selected server. Try again, or choose another server.",
  },
  // The Reports tab: the list of reports
  reports: {
    title: 'Reports',
    subtitleStaff: 'View operations and customer reports',
    subtitleCustomer: 'View your inventory reports',
    profileAndSettings: 'Profile and settings',
    inventorySection: 'Inventory reports',
    operationsSection: 'Operations reports',
    cardLabel: '{{title}}. {{description}}',
    // The titles are the report screens' own (`reports.titles`).
    descriptions: {
      customerActivity: 'Consolidated view of all customer operations',
      stockSummary: 'View current inventory at a glance',
      itemStockSummary: 'View all items aggregated across customers',
      dispatchActivity: 'Recent dispatches and outbound goods',
      grnActivity: 'Recent goods received with invoice status',
      invoiceHistory: 'Billing history with payment status',
      stockAging: 'Analyse how long stock has been stored',
      operationsDashboard: 'Daily KPIs and activity overview',
    },
  },
};
