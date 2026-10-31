/**
 * English text: central. Central (association) sign-in, My facilities, the
 * catalogue, the linking step and the central account (docs/CENTRAL_LOGIN.md).
 * English is the source; src/i18n/locales/gu/central.ts must have the same keys.
 */
export const central = {
  signIn: {
    // Under the title, in place of a facility: this sign-in is for the association.
    note: 'One sign-in for every member cold storage.',
    // First sign-in on this phone: Continue stays disabled until this is ticked.
    acceptTerms: 'I agree to the Terms of Service and the Privacy Policy',
    acceptTermsHint: 'Tick this to send the code',
    acceptFirst: 'Tick the box above to continue',
    endedTitle: 'Signed out',
  },
  facilities: {
    title: 'My facilities',
    add: 'Add facility',
    emptyTitle: 'No facilities yet',
    emptyMessage: 'Add the cold storage you work with. Each one decides what you can see.',
    loading: 'Loading your facilities',
    opening: 'Opening {{facility}}…',
    // Shown when a facility is tapped while the phone is still signing out, or another one is still opening
    signingOut: 'Signing out…',
    signingOutTitle: 'Still signing out',
    signingOutMessage: 'This phone is still finishing the sign-out. Try again in a few seconds.',
    stillOpening: 'Still opening {{facility}}. Wait for it to finish.',
    // {{status}} is one of the status words below, or of auth.enrollment.status.
    cellLabel: '{{name}}, {{status}}',
    cellLabelCity: '{{name}}, {{city}}, {{status}}',
    cellHint: 'Opens this facility',
    goneMessage: '{{facility}} is no longer listed by the association.',
    goneRemove: 'Remove from my list',
    refreshNote: 'A status is checked again when you open the facility.',
    accountLabel: 'Your account',
    accountHint: 'Name, sign out and account deletion',
    // Approved, Requested and Revoked use auth.enrollment.status.
    status: {
      linkNeeded: 'Code needed',
      unavailable: 'Unavailable',
    },
  },
  catalogue: {
    searchPlaceholder: 'Search by name, town or district',
    searchLabel: 'Search facilities',
    loading: 'Loading facilities',
    emptyTitle: 'No facilities listed yet',
    emptyMessage: 'The association has not listed any cold storage yet. You can enter a facility address instead.',
    noMatchTitle: 'No facility matches "{{search}}"',
    noMatchMessage: 'Check the spelling, or search by town or district.',
    errorTitle: "Couldn't load the facilities",
    // Pull to refresh failed; the list stays. {{message}} is the reason (central.errors).
    refreshFailed: "Couldn't refresh the list. {{message}}",
    enterAddress: 'Enter address',
    enterAddressHint: 'For a facility that is not in the list',
    // A footnote line on a row the person already has on My facilities.
    onYourList: 'On your list',
    // Whether the association's service reached the facility at its last check, about once a
    // minute (style guide §3.5). A screen reader hears the row as its visible lines, joined by commas.
    status: {
      online: 'Online',
      offline: 'Offline',
      noServer: 'No app server yet',
    },
    // Under an Offline row: when the association's service last reached the facility.
    lastSeen: 'Last seen {{time}}',
    lastSeenJustNow: 'Last seen just now',
    neverSeen: 'Not reached yet',
    cellHint: 'Adds this facility to your list and opens it',
    // A member with no app server yet: shown greyed, never added or opened. {{name}} is its name.
    noServerTitle: '{{name}} is not on the app yet',
    noServerMessage: "This cold storage hasn't set up its app server yet, so it can't be added. When it has, it shows here as Online.",
    noServerHint: "Explains why this cold storage can't be added yet",
  },
  link: {
    // {{facility}} is the facility's name.
    heading: 'Enter the code from {{facility}}',
    // The phone number is shown on its own line below this text.
    lead: '{{facility}} asks for its own code each time you sign in. Enter the 6-digit code it sent to',
    notSentTitle: "Couldn't send the code",
    backLabel: 'Back to My facilities',
    backHint: 'Leaves without entering the code',
  },
  account: {
    nameLabel: 'Your name',
    namePlaceholder: 'Full name',
    nameHelp: 'A facility sees this name when you ask it for access.',
    nameInvalid: 'Enter a name of up to 80 characters.',
    saveName: 'Save name',
    saveFailedTitle: "Couldn't save the name",
    signedInAs: 'Signed in with {{phone}}',
    deleteAccount: 'Delete my account',
    deleteSubtitle: 'Deletes your association sign-in',
    deleteTitle: 'Delete your association account?',
    deleteMessage:
      'Your association sign-in and your name are deleted, and you are signed out on every phone. This cannot be undone.\n\nRecords at a cold storage are kept by that cold storage. Ask each one to remove them.',
    deleteFailedTitle: "Couldn't delete the account",
    deleteUnknownTitle: 'No answer from {{facility}}',
    // "Sign out on all phones" (central service 0.4.0 and later); the dialog says that a cold
    // storage already open on another phone stays open there until the person signs out there.
    signOutAll: 'Sign out on all phones',
    signOutAllSubtitle: 'Ends your association sign-in on every phone, this one included',
    signOutAllTitle: 'Sign out on all phones?',
    signOutAllMessage:
      "You'll be signed out of your association account on every phone, this one included. A cold storage you already have open on another phone stays open there until you sign out on that phone.\n\nYou'll need your mobile number and a one-time code to sign in again.",
    signOutAllFailedTitle: "Couldn't sign out on all phones",
  },
  signOut: {
    confirmMessage:
      "You'll be signed out of the association and of the cold storage you have open. You'll need your mobile number and a one-time code to sign in again.",
    notCleared:
      "This phone couldn't remove your association sign-in from its secure storage. Restart the app and check that you're signed out before anyone else uses this phone.",
  },
  // Inside a facility while central login is on (src/features/account/useAccountActions.ts):
  // leave this facility only; {{facility}} is its name.
  leave: {
    action: 'Leave this facility',
    subtitle: 'Leave {{facility}} and return to My facilities. You stay signed in to the association.',
    subtitleNoName: 'Return to My facilities. You stay signed in to the association.',
    confirmTitle: 'Leave {{facility}}?',
    confirmTitleNoName: 'Leave this facility?',
    confirmMessage:
      'Unsaved forms are discarded. You stay signed in to the association and can open this facility again from My facilities.',
    confirmAction: 'Leave',
    saveInFlight: 'A save is still being sent. Wait a few seconds, then try again.',
    thisFacility: 'this facility',
    leftTitle: 'Left {{facility}}',
    signedOutTitle: 'Signed out',
    accountDeletedTitle: 'Your account was deleted',
    cleanupFailed: "Some of {{facility}}'s data couldn't be removed from this phone. Restart the app before someone else uses it.",
  },
  // Inside a facility: end the association sign-in and the facility on this phone.
  // The dialog's message is signOut.confirmMessage.
  phoneSignOut: {
    action: 'Sign out of this phone',
    subtitle: 'Ends your association sign-in and this facility on this phone.',
    confirmTitle: 'Sign out of this phone?',
  },
  switch: {
    action: 'Switch facility',
    busyMessage: 'Finish the current operation before switching facilities.',
    failedTitle: "Couldn't switch facility",
  },
  pending: {
    approvedMessage: '{{facility}} approved your access. Open it from My facilities.',
  },
  // Opening a facility; {{facility}} is its name
  open: {
    failedTitle: "Couldn't open {{facility}}",
    unreachable: "{{facility}} can't be reached right now. Check your connection and try again.",
    switchFailed: "Couldn't change to {{facility}}. Try again.",
    conflict: 'This mobile number is linked to another sign-in at {{facility}}. Ask the facility administrator.',
    revoked: "{{facility}} has withdrawn your access. Contact the facility's administrator if you think this is wrong.",
    centralUnavailable: '{{facility}} is not accepting association sign-in right now. Try again later.',
    keysUnavailable: "{{facility}} couldn't check your sign-in just now. Try again in a few minutes.",
    invalidToken: "{{facility}} couldn't verify your sign-in. Try again. If this keeps happening, tell the facility administrator.",
    rateLimited: 'Too many attempts at {{facility}}. Try again later.',
    rateLimitedSeconds: 'Too many attempts at {{facility}}. Try again in {{seconds}} seconds.',
    rateLimitedMinutes: 'Too many attempts at {{facility}}. Try again in {{minutes}} minutes.',
    network: 'The connection to {{facility}} was lost. Check your connection and try again.',
    failed: "{{facility}} couldn't sign you in. Try again later.",
    smsOfferTitle: 'Sign in with a facility code?',
    smsOfferMessage: '{{facility}} does not use association sign-in. You can sign in there with a code that the facility sends to your mobile number.',
    // The person on the phone changed while a facility was opening, and the sign-in that facility
    // gave the earlier person had to be ended on this phone. Shown to whoever is on the phone now,
    // so the facility is not named.
    previousClosedTitle: 'Earlier sign-in closed',
    previousClosed: 'A facility was still opening for the earlier sign-in on this phone. It has been closed, and nothing from it stays on this phone.',
    previousNotClearedTitle: "Couldn't close the earlier sign-in",
    previousNotCleared:
      "A facility was still opening for the earlier sign-in on this phone, and it couldn't be closed completely. Restart the app before anyone else uses this phone.",
    // Opening a facility while this phone is still ending an earlier sign-in there. The facility
    // is not named: that it is still being closed would tell where the earlier sign-in was.
    previousPending: 'This phone is still closing an earlier sign-in. Try again in a minute.',
  },
  // Answers of the association's sign-in service
  errors: {
    network: "Couldn't reach the association's sign-in service. Check your connection and try again.",
    unavailable: "The association's sign-in service is not available right now. Try again later.",
    rateLimited: 'Too many attempts. Try again later.',
    rateLimitedSeconds: 'Too many attempts. Try again in {{seconds}} seconds.',
    rateLimitedMinutes: 'Too many attempts. Try again in {{minutes}} minutes.',
    invalidCode: 'That code is wrong or has expired. Check it, or ask for a new code.',
    tooManyAttempts: 'Too many wrong codes. Ask for a new code.',
    smsUnavailable: "The code couldn't be sent just now. Try again in a few minutes.",
    unknownFacility: "This cold storage is not on the association's list, so association sign-in can't be used there.",
    invalidRequest: "The sign-in service didn't accept the request. Check what you entered and try again.",
    sessionEnded: 'Your association sign-in has ended. Sign in again. If you did not expect this, open your account after signing in and choose Sign out on all phones.',
    catalogueInvalid: "The list of facilities couldn't be read. Try again later.",
    signOutAllIncomplete: "This phone's association sign-in had already ended, so your other phones may still be signed in. Sign in again and use Sign out on all phones.",
    notSupported: "This association service doesn't support signing out on all phones yet.",
  },
};
