/** English text: settings. English is the source; src/i18n/locales/gu/settings.ts must have the same keys. */
export const settings = {
  title: 'Settings',
  profileHint: 'Opens your profile',
  // The profile card with central login: role, a middle dot, the facility's name.
  profileRoleAtFacility: '{{role}} · {{facility}}',
  features: {
    title: 'Warehouse tools',
    customersSubtitle: 'Farmers and traders you store goods for',
    enrollmentReviewSubtitle: 'Approve people who asked to use this facility',
    enrollmentReviewWaiting: '{{count}} waiting',
    itemsSubtitle: 'Produce you store, like potatoes or garlic',
    usersSubtitle: 'People who can sign in, their role and customers',
    standardRate: 'Standard rate',
    standardRateSubtitle: 'The rate new items get',
    sensors: 'Temperature and humidity',
    sensorsSubtitle: 'Live readings and history',
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
    title: 'App colours',
    footer: 'Colours for the whole app. Works with light and dark mode.',
    optionLabel: '{{brand}} colours',
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
    version: 'Version {{version}}',
    versionBuild: 'Version {{version}} (build {{build}})',
  },
  deleteAccount: {
    warningTitle: 'Delete your account?',
    warningMessage:
      "This can't be undone. These are removed:\n• Your name and profile\n• Your customer assignments\n• Your sign-in, on every phone\n• This account's forms, searches and cache on this phone\n\nGRNs, dispatches and other records are kept. Appearance, language and report preferences on this phone stay.",
    confirmTitle: 'Confirm deletion',
    confirmMessage: 'Enter the mobile number on your account to delete it.',
    phonePlaceholder: '10-digit mobile number',
    mismatch: "This number doesn't match your account. Check it and try again.",
    onlyAdminTitle: "You're the only administrator",
    onlyAdminMessage:
      'Make another person an administrator in Users first, then delete your account.',
    openUsers: 'Open Users',
    failed: "Couldn't delete your account. Check your connection and try again.",
    offline: "You're offline. Connect to the internet, then try again.",
    noAnswer:
      "{{facility}} didn't answer, so we can't tell whether your account was deleted. Open {{facility}} from My facilities to check.",
    noAnswerNoName: "The server didn't answer, so we can't tell whether your account was deleted. Try again to check.",
    deleted: 'Your account at {{facility}} was deleted.',
    deletedNoName: 'Your account was deleted.',
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
  // Change warehouse server (inside Settings): the server in use and what to enter.
  server: {
    rowSubtitle: 'Now using {{facility}}',
    inUse: 'In use now',
    help: 'Enter the address of the other server (it starts with https://), or scan its QR code.',
  },
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
    // An administrator has nobody at the facility to ask: the details below go to whoever set up the server.
    askAdminSelf:
      "You are this facility's administrator. For problems with the app, share the details below with whoever set up your server.",
    noContact: "The app has no support contact details of its own. Your facility's office can tell you who to ask.",
    rolesTitle: 'Roles',
    yourRole: 'Your role: {{role}}',
    changesTitle: 'When something changes',
    newPhone: "New phone: install the app, enter your cold storage's server address (it starts with https://) or scan its QR code, and sign in with your mobile number. The code comes by SMS.",
    // Central login builds
    newPhoneCentral: 'New phone: install the app, sign in with your association sign-in, then open your facility from My facilities.',
    newNumber: 'New mobile number: you sign in with your number, and the app cannot change it. Ask an administrator of your facility what to do.',
    newRole: 'Different role or access: only an administrator of your facility can change your role and the customers you see.',
  },
  // Help, "Connection": how the phone reaches the server, and the warehouse network fallback
  // (src/features/connection/ConnectionSection.tsx, src/config/lanTransport.ts). {{example}} is a sample address.
  connection: {
    title: 'Connection',
    connectedVia: 'Connected via',
    viaInternet: 'Internet',
    viaWarehouseNetwork: 'Warehouse network',
    viaHelp:
      'The phone uses the warehouse network only while the internet is not working, and goes back to the internet when it works again.',
    // The old configuration is cured by creating the gateway-lan container again (the server's start step), not by a restart.
    oldConfiguration:
      "The warehouse network answered with an old configuration. Ask whoever runs your server to run the server's start step again.",
    addressTitle: 'Warehouse network address',
    addressFromServer: 'From your server',
    addressTyped: 'Typed by you',
    addressNone: 'Your server does not offer a warehouse network address, so this phone uses only the internet.',
    addressChange: 'Change address',
    addressSave: 'Save address',
    addressUseServer: "Use your server's address",
    addressFieldLabel: 'Warehouse network address',
    addressHelp: 'Your server shows this address. It starts with http:// and ends with a port number.',
    // {{server}}: the address the server offers.
    addressInvalid: "Change only the last number of your server's address, {{server}}. Example: {{example}}.",
    addressSaved: 'Address saved.',
    checkNow: 'Check now',
    checking: 'Checking…',
    // The words of a check (shown as a status tag) and the sentence under each one that failed.
    statusReachable: 'Reachable',
    statusUnreachable: 'Not reachable',
    statusOtherNetwork: 'Not on the warehouse Wi-Fi',
    detailUnreachable: 'Nothing answered at this address. Check the address, and that this phone is on the warehouse Wi-Fi.',
    detailUnreachableIos: 'On iPhone, also open Settings, Privacy & Security, Local Network, and allow this app.',
    detailRefused: "Your server does not accept this phone's Wi-Fi address.",
    detailWrongServer: 'Another device answered at this address.',
    detailOtherNetwork: 'Connect this phone to the warehouse Wi-Fi, then check again.',
    statusNetworkUnknown: 'Wi-Fi address not known',
    detailNetworkUnknown: 'This phone could not read its own Wi-Fi address, so it does not use the warehouse network. Try again in a moment.',
    resultNotSet: 'No address to check',
    lastChecked: 'Last checked {{when}}: {{result}}',
    neverChecked: 'Not checked yet',
    dailyNote:
      'The phone checks this address once a day while it is on the warehouse Wi-Fi and the internet works, and again every hour until it is reachable.',
  },
};
