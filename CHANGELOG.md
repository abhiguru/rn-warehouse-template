# Changelog

## Unreleased — sign-in session, profile, customer lists and crash reports from the 2026-10-10 review

Backend migrations that belong with this: 42 (`direct_write_guard`), 43
(`image_paths_and_document_expiry`) and 44 (`auth_hardening`). The app works
against a server without 44, but only with it does a lost refresh answer no
longer sign the user out. Customer accounts still cannot search or sort their
dispatches and invoices on the server: the list RPCs that can
(`get_dispatch_list_with_items`, `get_invoices_list`) are for warehouse roles,
so that part is done in the app until the backend offers it.

- Slow network: when the app stops waiting for a session renewal (15 seconds)
  it asks once more with the same token instead of keeping a token the server
  has already replaced. Before, the next renewal signed the user out.
- Wrong device clock: a phone whose clock is hours fast can sign in, and a
  phone whose clock is slow no longer gets a stretch of failing requests every
  hour. The app follows the server's clock for token expiry, and when the
  server says a token has expired it renews the session and repeats the
  request if it was a read. A save is not repeated by itself; it can be tried
  again at once.
- A session that the server refuses is also ended on the server. Signing in
  while another session is still stored ends that session on the server too.
- "Change facility" is no longer blocked by a list that is still loading or
  hanging: only a save in progress holds it back. A request the app has
  stopped waiting for is cancelled.
- After the app starts from its stored profile it checks the profile with the
  server, so a changed role or customer assignment shows without signing in
  again.
- Profile: changing your own name works (every save was refused by the
  server). A save that changes nothing is reported instead of called a success.
- Customer accounts, dispatches and invoices: the default dispatch list loads
  one page from the server. Sorting, searching, paging and the "Show N" count
  use one download of the customer's history for two minutes instead of one
  download each; pull down to read it again. A search reaches dispatches
  older than the newest 1000, and if a customer has more than 10000 the list
  says that only the newest are searched. Today's invoices are no longer
  hidden on a device whose date is behind.
- New invoice: going back to step 1, or looking at the GRN and returning, no
  longer resets rates typed on step 2.
- New dispatch: photos that do not upload after the dispatch is saved are
  named, with "Try again", instead of a clean "saved".
- GRN: the server's photo refusals (a photo that is not in the receipt's own
  folder, not in storage, already attached elsewhere) are shown in the app's
  language. A new GRN is saved without an image list; its photos follow.
- Searches: a comma, bracket, `%` or `_` typed into the customer list filter,
  the GRN number search or the price form's item search is searched for as
  typed.
- Customers, Items, Users and the change log now sign out when the server
  says the session was revoked, like the other screens.
- Server address: an address that forwards to another server is named as such.
- Privacy: crash reports (when a facility has turned them on) no longer carry
  the raw text of an error, which could include a phone number or a row from
  the server. Customer rows and search text are no longer written to the
  device log. The recent-customer, recent-sender and recent-item lists are
  removed whenever a session ends, not only on "Log out".

## Unreleased — invoice, pricing and customer fixes from the 2026-10-10 review

Needs backend migrations 39 (`dispatch_lot_ownership`) and 41
(`invoice_line_rules`); merge and deploy the backend first. Without 41 the
server does not yet refuse a second invoice for a GRN or a rate outside the
range, and the Line items tab shows a one-time GRN's lines with the old
monthly amounts.

- Invoice totals are the server's. After a save the dialog shows the total the
  server stored (read back when the save does not return it); if it differs
  from what the form showed, the dialog says so, and if it cannot be read no
  amount is shown. The form's own total is labelled "Estimated total", also in
  the confirmation.
- "One-time charge" is no longer a switch on the invoice. It is shown
  read-only and comes from the GRN's pricing mode, which is what the server
  charges by: a one-time GRN is charged once per unit, without duration and
  without labour. Change it on the GRN.
- Invoice details, Line items: each line shows the tax and total the server
  computed, so the groups add up to the invoice. A line whose GRN item is not
  known is no longer merged with another line of the same name and quantity.
  Breakdown: a billed dispatch opens by its id (the link never appeared before).
- Editing an invoice: viewing the GRN and coming back no longer replaces the
  saved line rates with the current price list or forgets the stored discount
  and its reason. When the discount is changed, the recorded reason is taken
  out of the field and a new one has to be written; typing the stored amount
  again puts it back. The reason field stays when a discount is set to 0.
- Rate fields (charge, labour rate, tax) keep what is typed, so "5.50" and a
  tax of "2.5" can be entered. A value that is not a number, is negative or is
  above the server's range (charge and labour rate 0 to 999999, tax 0 to 100)
  is reported under the field and not stored; "Next" waits until it is
  corrected. "1,500" is no longer read as 1.
- Discount field: a discount above the invoice amount, or text that is not a
  number, is reported and Save waits; on leaving the field it shows the
  discount the invoice really has. On Android it opens the number keyboard.
- Before a new invoice is saved the app checks the GRN again and says so when
  it was invoiced meanwhile or its dispatches changed. The server's refusals
  ("GRN is already invoiced", "A dispatch line is already on another invoice",
  the rate ranges, "Cannot delete an invoice that has payments", and the
  customer-ownership refusals of migration 39) are shown in the app's language.
- The default invoice date, financial year and the "not in the future" limit
  follow the current day when the app has been open past midnight or past
  1 April. The default dispatch date does the same.
- Opening the price form from an invoice line no longer creates a price: the
  customer's existing price opens for editing, otherwise an empty form filled
  from the line, and the price is created only by Save. The pencil is shown to
  administrators and supervisors only, and the price form itself refuses
  everyone else. The price form no longer accepts "1,250" as 1 or text that is
  not a number.
- Customers: a 10-digit mobile number that begins with 91 is accepted and
  shown in full. A failed deactivate or restore is reported; the app no longer
  writes the customers table directly when the server call fails.
- Logs: invoice service errors are logged as code and message only, the
  customer form no longer logs name and mobile, and the logger hides the
  12-digit phone form while leaving ordinary 4-6 digit numbers readable.

## Unreleased — GRN and dispatch form fixes from the 2026-10-10 review

- Dispatch: the GRN picker lists and searches only the GRNs of the dispatch's
  customer, and a GRN of another customer can no longer be added (it was only
  flagged with a warning). The server's refusal of such a lot is shown in the
  app's language. The backend change that rejects another customer's lots when a
  dispatch is saved belongs with this; until it is deployed the block is
  client-side only.
- GRN and dispatch number fields: a number that another document already holds
  is reported under the field ("GRN A0010 already exists") and the form cannot
  move on until it is changed. Typing a number no longer resets or reloads the
  form; in edit mode the document's own number is not a duplicate. The GRN
  number drops spaces and is limited to 8 characters.
- GRN photos are changed on the server only when the GRN is saved. A photo added
  or removed while editing is no longer applied at once, so "Discard changes"
  leaves the saved photos as they were.
- A photo on a line added while editing a GRN is uploaded with the saved line.
  Adding a line in GRN edit also needs the backend fix for `update_grn` (the
  `pricing_mode` insert); merge and deploy the backend first.
- When a photo does not upload after a GRN is saved, the app names the photos
  and offers "Try again" instead of reporting a clean save.
- GRN default date and the "not in the future" limit follow the current day when
  the app has been open past midnight.
- Dispatch quantity: text that is not a whole number ("12.5", "-5") is kept as
  typed with a message, not silently changed to another number.

## Unreleased — English and Gujarati (2026-10-10)

- The app can be used in English or Gujarati (ગુજરાતી). The language is chosen in
  Settings (Phone language, English, ગુજરાતી) and, before signing in, with the
  switch on the server and sign-in screens. The change shows at once, without a
  restart; a half-typed mobile number is kept.
- In Gujarati, counts, weights, amounts, dates and times are shown in ૦-૯.
  Identifiers stay as typed in 0-9: GRN, dispatch and invoice numbers, vehicle
  numbers, GST, PAN, phone numbers and login codes.
- Numbers typed in ૦-૯ are accepted wherever a number is entered or searched.
- Printed documents (GRN, dispatch and invoice PDFs and prints) and the login
  SMS stay in English. The terms of service and the privacy policy stay in
  English.
- Text typed by people (customer, item and package names, notes) is never
  translated.
- The words follow `docs/GUJARATI_GLOSSARY.md`; how to add or change text is in
  `docs/I18N.md`.
- Needs no backend change.

## Unreleased — list search and new filters (2026-10-10)

- GRNs, Dispatches, Invoices, Orders and the Queue have a search field. Every
  typed word must match; a date ("7 Oct"), a number range ("A0010-A0020") or a
  financial year ("FY 2026") typed there becomes a filter chip.
- Filters are one row of chips under the search field, with a full "Sort and
  filter" page for the rest. Each chip opens one short sheet whose button names
  the result ("Show 34 items"). The sort is the second chip; the separate sort
  bar is gone. Invoices can be sorted by date, number, customer or total.
- Filters that were shown but never applied now work (dispatch date range and
  package, invoice date range and several customers, item-pricing effective
  dates) or were removed (dispatch weight, invoice payment status and amount).
- Filters, search and sort last until the app is closed and are cleared on
  sign-out; "Clear all" affects the current list only.
- GRN and dispatch cards have an outline and a footer reading "Tap for item
  details".
- Removed: the customer dispatch history screen (nothing opened it) and the old
  filter sheet, sort bar and filter store.
- Needs backend migrations 31–37 (document number order, list search, invoice
  and dispatch filters). Deploy the backend first: on an older backend the
  search and the new filters are ignored or refused.

## Unreleased — invoice discount reason (2026-10-09)

- The invoice review step has a "Discount reason" field whenever there is a
  discount, and the reason is sent with the invoice (`discount_reason`). Staff
  must fill it before submitting a new or changed discount; an edit that keeps
  the saved discount does not ask again. Matches backend migration 30, which
  records the reason and who set the discount; older backends ignore the field.

## Unreleased — dispatch photos after submit, registration suggestions (2026-10-09)

- A submitted dispatch's Images tab has an Add Photo button for admin,
  supervisor and staff (testvm2 known issue 4). Photos could only be attached
  in the create flow's review step, below the item list, and a dispatch that
  went in without one could not get one later. It uses the existing
  register/upload/confirm dispatch photo flow, as GRN details already does.
- Vehicle registration suggestions appear only after you start typing (testvm2
  known issue 5). An empty dispatch or GRN form showed the server's most-used
  registration in full where the placeholder belongs, so it looked like a value
  left over from a previous session. Form drafts were already cleared on
  sign-out.

## Unreleased — revoked sessions after a key rotation (2026-10-09)

- After `rotate-keys.sh` the app now signs out and returns to the login screen
  instead of showing empty lists and raw errors (testvm2 finding 9). The
  gateway (Kong 3) rejects the old key with `401 {"message":"Unauthorized"}`,
  which the app did not recognize; a refresh refused that way was treated as a
  network failure, so even a cold start kept the dead session. Every request
  now passes through one check that ends the session once on a gateway key
  rejection; the existing forced sign-out reloads the server configuration, so
  the next login uses the new key. An expired access token still refreshes.
- Customers shows "Unable to load customers" with Retry when the list fails,
  instead of "No Customers / Create one to get started".

## Unreleased — orders screen review fixes (2026-10-09)

Requires backend migrations 28 and 29 (`supabase-warehouse-template`).

- The orders list, the order queue and the item catalog (browse and search) load
  more rows as you scroll, instead of stopping at 200 orders or 50 lots.
- A quantity shows SAVED only after the server stores it; a refused change
  reverts to the stored quantity.
- Removing a cart line uses the `remove_item_from_order` RPC, so removals appear
  in the order history.
- Staff accounts see the Queue tab and can work every customer's cart.
- Recent dispatches on the order screen are sorted by date (the sort key was
  ignored before). Catalog lot photos now appear.
- A refused item search shows as an error instead of "no items".
- Catalog submit no longer removes fulfilled lines it never showed.
- Removed unused order service methods (`createDispatchFromOrder`,
  `getOrderDispatches`, `getOrderSummary`, `isOrderEmpty`).

## Unreleased — gateway source-demo closure (2026-09-23)

- Recorded the reviewed mobile/backend merge checkpoint and successful exact-main
  CI in the handoff and native acceptance records.
- Kept the complete and affected iPhone observations tied to their tested SHAs;
  documented runtime equivalence and the separate production gates.

## Unreleased — iPhone USB Realtime transport (2026-09-23)

- Forward authenticated Realtime WebSocket upgrades through the checkout-owned
  USB relay without broadening its fixed loopback destination or USB binding.
- Cover bidirectional frames, gateway rejection, forbidden upgrade paths and
  socket cleanup. Previously HTTP worked but automatic updates could not cross
  the relay. Device acceptance is recorded in the archived native acceptance
  record (see `docs/HISTORY.md`).
- Add accessible Refresh actions to Orders and Order Queue, including empty
  states, so API fallback does not depend on a scroll gesture. Show busy state
  and suppress repeated presses during refresh.

## Unreleased — order/cart live updates

- Refetch order lists, supervisor queues and carts on authenticated order events
  and reconnect, with session cleanup and foreground/network lifecycle handling.
- Keep stock/invoice subscriptions and production capacity acceptance outside
  this change; see `docs/ORDER_LIVE_UPDATES.md`.

## Unreleased — local Android artifact readiness (2026-09-22)

- Added a native APK audit for forbidden archive paths and embedded material,
  Android permissions, public certificates, artifact hashing, and required
  third-party notices.
- Built and audited a fresh development APK, documented the separate exported
  icon-font inventory, and kept release signing/store review open.
- Extended CI with Expo Doctor and a native debug build/audit job; no APK is
  uploaded or published.
- Linked the companion backend's provider-independent readiness evidence and
  preserved the immutable source-demo release tags.

## Unreleased — iOS acceptance handoff (2026-09-21)

- Reconciled the final handoff records: all local source-demo acceptance and
  source-only attribution items are closed, while production distribution,
  deployed retention/telemetry and optional integrations remain separate gates.
- Closed the complete physical-iPhone source-demo matrix on the final merged pair:
  PR #18 / `9ba56ff122dc38dc57d6100de4c27599023d22b1` with backend PR #13 /
  `cf18f1e43ab613310b1b13339ab97e8533861f9b`; exact-main CI and affected
  iPhone reruns passed.
- Added tracked checkout-owned USB-only iPhone onboarding, definitive
  revoked-session logout, per-GRN customer dispatch history, invoice-to-GRN
  navigation, stable order targeting and focused regressions.
- Replaced the continuation handoff with durable acceptance evidence and recorded
  the end-user pricing, code-level billing-day and PDF/cold-storage branding
  customization boundaries.
- Repaired assigned-customer GRN and recent-dispatch history views without
  widening staff RPC grants. Customer responses are explicitly normalized,
  pagination works across multiple assignments, and visible errors replace
  misleading empty states. The companion backend adds the guarded customer
  dispatch-list contract and extends customer GRN filtering.
- Added customer-history regression coverage and recorded fresh migration, live
  API, and paired-contract evidence. The post-release repair passed paired PR
  review, CI and Android API-36 emulator smoke on the merged pair.
- Fixed Item Pricing customer search, duplicate dispatch-lot feedback, private
  PDF URL handling and native warm-link delivery, with physical-iPhone evidence.
- Made CLI bootstrap, doctor and postinstall entry checks work through symlinked
  checkout paths, with a regression that verifies failures are not silently skipped.
- Recorded the qualified iOS acceptance result, remaining customer-view/session
  defects, physical-USB onboarding gap and pricing/PDF customization contracts.
- Preserved all published source-release tags; the changes passed paired review
  and exact-main CI.

## 0.2.2-demo — source-only prerelease (2026-09-18)

- Added Android-first clean onboarding, ownership-aware emulator/Metro guidance,
  and source-demo versus production/physical-device boundaries.
- Hardened authentication restoration, account isolation, protected navigation,
  and GRN signed-image cache handling.
- Added dispatch-number mobile contract coverage, invoice detail compatibility,
  status-bar lifecycle tests, and development-client cold-start regression tests.
- Verified 20 suites / 165 tests, typecheck, setup/dependency gates, fresh native
  debug build/install, core emulator workflows, and paired backend CI.
- Reconciled public onboarding, acceptance scope, maintainer redistribution
  attestation, tracked artwork provenance, and third-party icon/font notices.
- Restricted the release workflow to the exact `v0.2.2-demo` tag with positive
  and negative regression coverage; publication contains source archives only.

## Unreleased — second-pass review

- Documented incomplete backend integration, inactive CI, and dependency findings.
- Removed Docker/private-key inspection from setup; added read-only bootstrap checks.
- Fixed SecureStore config authentication, legacy JWT decoding, and customer table
  queries, with regression tests and corrected native/device setup instructions.

## 0.1.0

Initial source preview; not verified as a working end-to-end application.
