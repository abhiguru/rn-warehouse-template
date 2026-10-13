/** English text: settings. English is the source; src/i18n/locales/gu/settings.ts must have the same keys. */
export const settings = {
  title: 'Settings',
  profileHint: 'Opens your profile',
  features: {
    title: 'Warehouse tools',
    customersSubtitle: 'Manage customer accounts',
    enrollmentReviewSubtitle: 'Approve verified customers and assign access',
    itemsSubtitle: 'Manage inventory items',
    usersSubtitle: 'Manage user accounts',
    itemPricing: 'Item pricing',
    itemPricingSubtitle: 'View and manage prices',
    sensors: 'Temperature and humidity',
    sensorsSubtitle: 'Unavailable in the local demo',
  },
  // The Preferences section: Appearance, Language on this phone and Brand, each a row that opens a sheet.
  preferences: {
    title: 'Preferences',
  },
  appearance: {
    title: 'Appearance',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    footerSystemDark: "Follows your phone's setting. Dark mode is on now.",
    footerSystemLight: "Follows your phone's setting. Light mode is on now.",
    footerDark: 'Dark mode is always on.',
    footerLight: 'Light mode is always on.',
  },
  language: {
    title: 'Language',
    system: 'Phone language',
    footerSystem: "Follows your phone's language. The app is in English now.",
    footerChosen: 'The app is in English.',
    optionLabel: '{{language}} language',
    // The row in Preferences; the choice is kept on this phone (docs/I18N.md).
    rowLabel: 'Language on this phone',
    // Shown in the language sheet (src/i18n/useProfileLanguage.ts).
    deviceNote:
      'The language stays on this phone for everyone who signs in here. Your choice also goes with your account to a phone where no language is chosen.',
  },
  brand: {
    title: 'Brand',
    footer: 'Colours for the whole app. Works with light and dark mode.',
    optionLabel: '{{brand}} brand',
    orange: 'Orange',
    gcsa: 'GCSA navy',
  },
  account: {
    title: 'Account',
    deleteAccount: 'Delete account',
    deleteAccountSubtitle: 'Removes your profile and sign-in. Records are kept.',
    // Central login: the account at the facility that is open; {{facility}} is its name.
    deleteAtFacility: 'Delete my account at {{facility}}',
    deleteAtFacilitySubtitle: 'Removes your profile and sign-in here. Records, your association sign-in and other facilities stay.',
  },
  about: {
    title: 'About',
    terms: 'Terms of service',
    termsSubtitle: 'View terms and conditions',
    privacy: 'Privacy policy',
    privacySubtitle: 'How we handle your data',
  },
  development: {
    title: 'Development',
    styleGuide: 'Style guide',
    styleGuideSubtitle: 'Tokens and components in the current brand and mode',
  },
  footer: {
    version: 'Management System v{{version}}',
    versionBuild: 'Management System v{{version}} (build {{build}})',
  },
  deleteAccount: {
    warningTitle: 'Delete your account?',
    warningMessage:
      "This can't be undone. These are removed:\n• Your name and profile\n• Your customer assignments\n• Your sign-in, on every phone\n• This account's forms, searches and cache on this phone\n\nGRNs, dispatches and other records are kept. Appearance, language and report preferences on this phone stay.",
    confirmTitle: 'Confirm deletion',
    confirmMessage: 'Enter the mobile number on your account to delete it.',
    phonePlaceholder: '10-digit mobile number',
    mismatch: "This number doesn't match your account. Check it and try again.",
    failed: "Couldn't delete your account. Check your connection and try again.",
    // Central login: the account at one facility; {{facility}} is its name.
    centralWarningTitle: 'Delete your account at {{facility}}?',
    centralWarningMessage:
      "Your profile, customer assignments and sign-in at {{facility}} are removed. This can't be undone.\n\nGRNs, dispatches and other records stay with {{facility}}. Your association sign-in and your other facilities stay; to delete your association account, tap your name at the top of My facilities. Appearance, language and report preferences on this phone stay.",
    centralConfirmTitle: 'Confirm deletion at {{facility}}',
    centralConfirmMessage:
      'Enter the mobile number on your account to delete your account at {{facility}}. Your association sign-in stays.',
  },
  // Help, "App details": what a person can share with whoever supports them. Never a
  // token, a phone number or profile data.
  diagnostics: {
    title: 'Details for support',
    app: 'App: {{name}}',
    version: 'Version: {{version}} (build {{build}})',
    versionNoBuild: 'Version: {{version}}',
    // {{system}} is Android or iOS, {{systemVersion}} its version number.
    device: 'Phone: {{system}} {{systemVersion}}',
    facility: 'Facility: {{facility}}',
    server: 'Server: {{origin}}',
    notConnected: 'No facility is chosen on this phone.',
    share: 'Share these details',
    shareHint: 'Opens the share sheet. No passwords, codes or personal details are included.',
  },
  // The Help screen (app/help.tsx). The Settings row that opens it has its own keys.
  help: {
    // The "Help and about" section of Settings and its Help row.
    sectionTitle: 'Help and about',
    row: 'Help',
    rowSubtitle: 'Who to ask, roles and app details',
    // The Help screen (app/help.tsx).
    title: 'Help',
    facilityTitle: 'Your facility',
    serverLabel: 'Server address',
    askTitle: 'Getting help',
    askAdmin: 'For help with the app or your account, ask an administrator of your facility.',
    noContact: "The app has no support contact details of its own. Your facility's office can tell you who to ask.",
    rolesTitle: 'Roles',
    yourRole: 'Your role: {{role}}',
    changesTitle: 'When something changes',
    newPhone: "New phone: install the app, enter your facility's address and sign in with your mobile number. The code comes by SMS.",
    // Central login builds
    newPhoneCentral: 'New phone: install the app, sign in with your association sign-in, then open your facility from My facilities.',
    newNumber: 'New mobile number: you sign in with your number, and the app cannot change it. Ask an administrator of your facility what to do.',
    newRole: 'Different role or access: only an administrator of your facility can change your role and the customers you see.',
  },
};
