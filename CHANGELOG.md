# Changelog

## Unreleased — owner decisions of 2026-10-11

Needs backend migration 48 (owner decisions of 2026-10-11) for the invoice
number per financial year and for the zero charge with a reason; merge and
deploy the backend first. On a backend without it the app still suggests a
number (see below).

Racks (decision 1) — no backend change
- A rack is any text. The rule "Floor/Chamber or Rack/Floor/Chamber" is gone
  from the item form, from the Save button of a line and from the checks before
  the review and before saving, in a new GRN and in an edit. A GRN whose lines
  were stored with racks such as "C3" or "20B" can be edited and saved again;
  before, such a line held the whole edit back. Only the length is still
  checked (30 characters, what the server column holds).
- The Floor and Chamber chips are optional. Each chosen chip adds its own
  "/Floor" or "/Chamber" after the typed text, and a second tap on a chosen
  chip takes it off again. A chip that is shown as chosen is part of the rack:
  a floor chosen alone gives "20B/F1" (it used to be highlighted without being
  saved, once the format rule no longer forced the second chip). The value
  next to the "Rack" label is what will be saved.
- The text is kept exactly as it is typed. The chips never take characters out
  of the text field: "R5/F2/C21" typed key by key used to be saved as
  "R51/F2/C2", because "R5/F2/C2" ends in a floor and a chamber from the chip
  lists and the form moved "/F2/C2" into the chips before the last key. The
  rack is now split into text and chips only when a line is put into the form
  (a stored rack that ends in a listed floor and chamber is shown as text plus
  chips; every other rack is shown whole in the text field), never while it is
  typed. Opening another line no longer shows the chips of the line edited
  before.
- A space can be typed at the end of the rack text ("ROW 3" could not be typed
  in one go); spaces at the two ends are dropped when the line is saved.

Invoice number per financial year (decision 2) — backend migration 48
- New invoice: the suggested number is the next one of the financial year of
  the invoice date. The app sends that year to
  `get_next_invoice_number(p_fin_year)` as the calendar year it starts in
  (2026 for April 2026 to March 2027).
- When the invoice date is moved into another financial year the next number of
  that year is asked for and replaces the suggestion. A number the user typed
  is never replaced; after the field is emptied the app suggests again.
- When the server has no number for that year ("No invoice number is left in
  financial year ...") or cannot be reached, the field is emptied and the hint
  reads "Couldn't get the next number. Type the invoice number." A suggestion
  made for the year before does not stay in the field.
- An answer that arrives late is not used: not over a number typed meanwhile,
  not for a year the form has left, not in a form that was discarded.
- A server without migration 48 refuses the parameter (PostgREST `PGRST202`);
  the app then asks once more without it and gets that server's number, which
  is counted across all years as before.
- An answer that is not a number is treated as "could not get the next
  number"; it used to be shown as 1.

Zero charge with a reason (decision 3) — backend migration 48
- An invoice line may have a storage charge of 0. The items step of a new
  invoice and of an edit no longer refuses such a line. A duration of 0 is
  still refused, and the two messages now speak of the duration only: "1 item
  has a duration of 0. The duration must be greater than 0." and "Every item
  needs a duration greater than 0."
- Review step (new invoice and edit): while a line has a charge of 0 the
  summary shows "Reason for zero charge" under the discount reason, built the
  same way (500 characters, several lines). Staff must fill it in: the label
  reads "Reason for zero charge (required)" with a red border, and Save answers
  "Enter a reason for the zero charge". Administrators and supervisors may
  leave it empty. Without such a line the field is not shown.
- Before saving, every role is told when something is free. The question
  "Save invoice N?" / "Update invoice N?" ends with one more line while lines
  have a charge of 0: "1 item has a charge of 0." or "3 items have a charge of
  0." ("૧ આઇટમનો ભાડાનો દર ૦ છે."). An item without a price in the price
  list arrives with a charge of 0 too, and an administrator or supervisor, who
  needs no reason, would otherwise save it as free without a word about it.
  Nothing new is refused: the reason stays optional for them.
- The reason goes to the server as `zero_charge_reason` in the header of
  `save_invoice` and `update_invoice`, only when a line has a charge of 0
  (trimmed; `null` when nothing was written). Without such a line the key is
  left out. Who gave the reason and when is recorded by the server.
- Edit: the stored reason is read from `get_invoice_detail`, shown in the
  field and sent back with the update as long as a line has a charge of 0,
  unless the user changes it. The server asks staff for a reason on every save
  of such an invoice, also when someone else made the line free, and takes an
  empty reason from an administrator or supervisor as "remove it". The app
  never clears the text itself; erasing it is the user's doing.
- The server's refusal "Enter a reason for the zero charge" is shown in
  Gujarati as its own sentence.
- Group rates no longer undo a free line. On the items step a group field
  ("Charge", "Labour", "Tax" above the lines of an item) sets that one rate on
  the lines of the group; the two other rates stay on each line as they are.
  Before, every group edit sent all three group fields, and for an invoice
  opened for editing those started as the average of the stored lines: with a
  free line beside a line at 5, changing the group tax made both lines 2.5,
  the reason field disappeared and the update dropped the stored reason. A
  group field now shows the rate its lines share, or stays empty with the
  placeholder "Mixed" ("જુદા જુદા") when they differ; it never shows an
  average. Typing a group charge still gives that charge to every line of the
  group (a line whose charge was typed on the line itself keeps it, as before).
- An invoice on which nothing is charged (every line has a charge of 0, no
  labour, no discount) may be saved with a total of 0. For every other invoice
  the total must still be more than 0: a discount that takes a charged invoice
  down to 0 is refused with "Total must be positive", also when one of its
  lines is free.

Android Back on the first step of a create form (decision 7) — no backend change
- New GRN, new dispatch, new invoice: the Back key on step 1 left the form
  without a word and kept what was typed out of sight. Once something was
  entered it now asks before discarding, with the question the X in the header
  ends in: "Discard this GRN?", "Discard this dispatch?", "Discard this
  invoice?". "Discard" does what it does after the X (the form is emptied, the
  list is shown); "Keep editing" stays. With nothing entered Back leaves for
  the list at once, as before.
- What counts as entered. GRN: a customer, a sender, a vehicle number, a note,
  a photo or a line. Dispatch: a customer, a vehicle number or a note (a typed
  vehicle number alone used to be dropped without a question). Invoice: a
  chosen GRN or a typed invoice number. What the form fills in itself (number,
  date, supervisor) does not count.
- New dispatch: the X asks once. It used to ask twice on every step: the
  header's "Cancel dispatch", then the step's own "Discard this dispatch?"
  dialog (on steps 1 and 2 once something was entered, on step 3 always). As
  in the GRN form since the fix above, the header asks the one question and
  the step discards: "Discard this dispatch?" with "The details you entered
  will be lost." on step 1, and with "The N items you added will be lost." on
  steps 2 and 3 once a line was added. The buttons are "Keep editing" and
  "Discard". Editing a dispatch already asked once and is unchanged.
- An open picker comes first. While a sheet is open on step 1 (sender,
  customer, supervisor, the GRN picker of an invoice), Back closes the sheet
  and nothing else: no question, and the form is not left. The form's Back
  listener used to be taken off and put on again each time the screen drew
  itself, which put it ahead of a sheet opened in between (React Native asks
  the listener added last first); Back then left the form, or asked to
  discard, with the sheet still open. `useBackHandler` now adds one listener
  when the screen comes into focus and keeps that one until the screen is
  left, on every step that uses it; what Back does is read when it is pressed.
  The sheets add theirs when they open (checked for `SearchableBottomSheet`
  and `CustomerSearchBottomSheet`); the date picker, the alerts and the
  confirm dialogs are native modals, which take Back themselves.
- Steps 2 and 3 are unchanged: Back goes to the step before. The edit forms
  are unchanged.
- One mechanism for the three forms: `useFirstStepBack`
  (`src/hooks/useFirstStepBack.ts`). The GRN, dispatch and invoice headers ask
  their own question through it (`backOnFirstStep` on the step header), so the
  X and Back cannot drift apart.

## Unreleased — pickers that never opened (supervisor, dispatch item and lot, item catalogue, change log)

No backend change.

- Six bottom sheets that are shown by a flag asked the sheet library to dismiss
  them while they were still hidden, starting with their first render. With
  `@gorhom/bottom-sheet` 5.2 that leaves the sheet in its "dismissing" state,
  and a sheet in that state does not render when it is presented, so the tap did
  nothing and no error was shown. Affected: the supervisor picker on the GRN and
  dispatch forms and the customer pickers built on the same component
  (`SearchableBottomSheet`), the dispatch item picker, the dispatch lot picker,
  the item catalogue browser and the change log.
- They now go through `useModalSheet` (`src/hooks/useModalSheet.ts`), which
  dismisses a sheet only while it is on screen. A test keeps any
  `BottomSheetModal` from being dismissed through its ref directly.
- Seen on a phone on 2026-10-11: the supervisor picker opens with and without a
  chosen supervisor and opens again after a choice; the dispatch item and lot
  pickers open and list the lots of the chosen GRN; on an order, "Add items to
  order" and "View order history" open, the first of them twice in a row.

Also found by the same device checks
- Leaving a GRN form with the X in the header asked "Discard?" twice: the
  header asked, then the step asked again. The header now carries the step's
  own message (how many items would be lost) and the step no longer asks.
- New invoice: when the next invoice number could not be fetched and the user
  typed one, the hint under the field changed to "The next number is filled
  in. You can change it." It now keeps saying that the number could not be
  fetched.

## Unreleased — follow-ups to backend migration 47 (GRN edit retry key, supervisors and access, supervisor picker)

Needs backend migration `00000000000047_review_followups.sql`; merge and deploy
the backend first. On a backend without it the app still saves an edited GRN
(see the first point), and a supervisor is held to the same limits by the app
alone.

GRN
- Saving an edited GRN sends an idempotency key (`update_grn`,
  `p_idempotency_key`). A Save repeated after no answer came back carries the
  same key, and the server answers with the result of the first one and applies
  nothing a second time. The app takes that answer (`"idempotent": true`) as a
  normal save, so the photos of a line added in the edit still go up under the
  line's saved id. A key is used again only by a Save that repeats the request
  sent last: a new one is made when the edit form loads the GRN, after every
  save the server answered with success, and whenever the form differs from
  what was sent last, also when it is changed back to an earlier state.
- The check added before ("which lines does the server hold?") stays, before
  every Save that follows one with no answer. It covers a form that was changed
  in between, and a server without the parameter. The saved ids it finds go
  into the request; the key is still the one of the Save that got no answer.
- A server that has not applied migration 47 refuses the unknown parameter
  (PostgREST `PGRST202`) before running anything. The app then sends the same
  request once more without the key. This costs one extra request per save on
  such a server.

User management
- A supervisor is no longer offered to activate a user, or to change anything
  on a user who is not active: the role, the status switch and the customer
  assignments are locked, with the note "This user has no access. Only an
  administrator can give it back or change this user." The server now refuses
  these (`ENROLLMENT_NOT_APPROVED`). The user list and details carry `active`
  only, not the state of the access request, so "not active" is what the app
  goes by. An administrator sees no change.
- A supervisor who deactivates a user is told beforehand that only an
  administrator can activate them again.
- The two new refusals have their own sentences in English and Gujarati:
  `ENROLLMENT_NOT_APPROVED`, and `ENROLLMENT_PENDING` (a role change on an
  access request nobody has reviewed yet, refused for every caller).

Supervisor picker
- `get_supervisors` gives staff rows without a mobile number. No change was
  needed: the picker is the only reader, and it has kept the id and name only
  since the number was taken out of its rows. A test now reads rows of the new
  shape.

Not done here: an administrator who opens a pending access request in user
management can still try to change its role and gets the new sentence; the
screen cannot lock the role beforehand because `get_user_details` does not say
that a request is pending (backend).

## Unreleased — second review of the 2026-10-10 fix branch (session, reports, GRN, invoice)

No backend migration is needed for these changes. One follow-up was open on the
backend: `update_grn` had no idempotency key (see "Not done here"; done in
backend migration 47 and the entry above).

Session and requests
- Every request has a time limit, where requests are sent (`gatedFetch`): 30
  seconds for a read, 60 for a write, 120 for an upload and for the document and
  print functions. A request on a connection that never answers stayed in flight
  until the app was closed, and a hung save kept "Change facility" answering
  "busy". The earlier limit lived in `callRPC`, which no screen called; it is
  removed.
- A session renewal whose answer is lost to the network is sent again with the
  same token: at once, then 2, 5, 10 and 20 seconds later in the background.
  Only a renewal the app itself timed out was repeated, so a dropped connection
  could still end in a forced sign-out. The repeat after a timeout waits 5
  seconds (a start of the app waited 30 seconds on a server that hangs, now 20).
- A token is renewed a tenth of its lifetime before it expires, five minutes at
  most. With the fixed five minutes a facility with `access_seconds` of 300 or
  less had its session renewed on every check and every request.
- The start-up guard navigates only once the root navigator is ready.

Reports and lists
- Report customer picker (customer accounts with several customers): the rows
  show the customers' names. They all read "Customer", because the profile a
  sign-in stores carries ids only. If the names cannot be read the picker says
  so, with Try again.
- Dispatch list of a customer account: a long history is collected five pages at
  a time instead of one after another.
- Gujarati: the "history limited" notice says વેપારી like the rest of the app.

GRN
- Only the prepared copy of a photo is ever uploaded. A photo whose preparation
  was still running or had failed was sent at Save as the original camera or
  gallery file. Save is now held until every photo is ready, and a photo that
  could not be prepared has to be removed or added again.
- A photo from the in-app camera is limited by its longer side (its size was not
  known, so only the width was limited).
- Editing: when the photos of a GRN cannot be read, the form does not open
  (Try again). It opened without them, and the next Save deleted them. Only
  confirmed photos are loaded.
- Editing: when a Save gets no answer, the form says the GRN may or may not be
  saved. The next Save first asks the server which lines it holds, so a line
  added in the edit is not added a second time; it is refused while the server
  cannot be asked.
- Creating: a form that created its GRN cannot create it again; closing the
  print dialog returns to the success dialog.
- A GRN or dispatch number that is taken still stops step 1 after the step was
  left and reopened. The form hooks no longer log the typed number or the
  user's name.

Invoice
- Editing: a discount reason you typed is never cleared or replaced by the app.
  It was wiped whenever the amount passed through the saved amount, which for an
  invoice saved without a discount was every time the field was cleared.
- A rate cell that is closed while it holds a refused value no longer keeps Next
  from working.
- The group tax field starts with the tax as stored (2.5, not 3).
- Editing: an invoice does not open when its GRN's pricing mode cannot be read
  (Try again). It opened with every line priced as monthly.

Not done here: `update_grn` should accept an idempotency key as `save_grn` does
(backend); a group whose lines have different rates still gets the group's
average on every line when one group rate is changed; whether a charge of 0 is
allowed on an invoice line (both forms refuse it today) is the owner's decision.

## Unreleased — dependency gate, install check, workflow pins and search logs from the 2026-10-10 review

No backend migration is needed. No dependency version changed. The details
are in docs/DEPENDENCY_SECURITY.md, first section.

- `npm run audit:dependencies` fails on any advisory at moderate, high or
  critical that is not on its list of accepted advisories. It looked at high
  and critical only. The list is the three locally repaired advisories
  (node-forge, braces, sprintf-js), each with a review date of 2027-01-10.
  **From 2027-01-11 the command fails on every branch until the list is
  reviewed** and the dates are moved or the entries removed. Low and info
  advisories are listed in the output and do not fail it.
- `npm start`, `npm run android`, `npm run ios`, `npm run web` and `npm test`
  first check that the postinstall patches are in place
  (`scripts/check-install.mjs`). An install with `--ignore-scripts` left the
  packages unpatched without a word.
- Dependabot: the packages held back from weekly version updates now get
  security pull requests. Each ignore entry names its update types.
- Workflows: every action is referenced by commit, with the release in a
  comment.
- Over-the-air updates are off by an explicit setting
  (`"updates": { "enabled": false }` in `app.json`); the native configuration
  is unchanged. A test refuses turning them on without code signing.
- Device log: the search, customer and user-profile services no longer write
  what was typed into a search, the answer of the customer, item and dispatch
  searches, the first result, or whole error objects to the console. They log
  counts, identifiers and error codes through the redacting logger.

Not done here: the `overrides` in `package.json` stay exact pins that are
reviewed by hand (ranges would change what is installed).

## Unreleased — photos, GRN logs, racks, search and Android backup from the 2026-10-10 review (low-severity items)

No backend migration is needed. Build note: the next Android build is the
first with backup turned off, and `npm run audit:artifact` now fails for a
build that leaves it on (every APK built before this entry does).

- Photos keep their shape. GRN and dispatch photos were resized to exactly
  1280 x 1280, which stretched every photo that is not square and enlarged
  small ones. Only the longer side is limited now, and a photo that already
  fits is not resized.
- The original camera or gallery file is never uploaded. When a photo could
  not be re-encoded the original was sent as it was, with its EXIF block
  (which can hold the GPS position), named `.webp` whatever it was. A GRN photo
  that cannot be written as WebP is written as JPEG and sent under that name
  and type; a photo that cannot be re-encoded at all is refused with "Failed to
  process image file".
- Racks: any floor and chamber codes are accepted. The rule was one facility's
  list (BASE, F1-F4 and C4, C7, C2, Anti-Ch), so another facility could not
  record a rack. A rack is now empty, `Floor/Chamber` or `Rack/Floor/Chamber`
  with any text in each part. The floor and chamber chips still show the same
  fixed lists; a facility with other codes types them in the rack field.
- The supervisor picker of the GRN and dispatch forms shows names only. It
  showed every administrator's, supervisor's and staff member's mobile number.
- New invoice, GRN picker: the number typed is searched for whole (it was cut
  at the first `_`), and `%` and `_` are matched as characters.
- List search: "Only the first eight words are searched." is shown when more
  are typed; the server drops the rest.
- Sign-out and server switch empty the image cache (disk and memory), so
  photos seen under one account do not stay on the phone for the next.
- Android backup is off (`android.allowBackup: false` in `app.json`). It was
  left at the default, on; only the rules added by `expo-secure-store` kept the
  app's storage out of Google backup. See docs/TELEMETRY_AND_PRIVACY.md §4.
- Device log: the GRN form, photo and details code, the pickers and the user
  administration service no longer write GRN headers (names, note, signed
  photo addresses), the whole `update_grn` request and answer, search text, the
  user list or a user's mobile number to the console. What is left goes
  through the redacting logger as identifiers, counts and error codes
  (`loggableError` in `src/utils/logger.ts`).
- Removed: `CustomerAutocomplete` and `UserAutocomplete`, which no screen used.
- Tests added for the invoice save request (exact keys), customer pincode, GST
  and PAN, the create/read/update/delete table per role, a stored customer
  filter, and the sort control of every list.
- `npm run typecheck:tests` type-checks the test files (`tsconfig.test.json`).
  It is not part of `npm run typecheck` yet: it reports 66 errors in 28 test
  files.

Not done here: an offline sign-out still leaves the session valid on the
server until it expires (needs a decision on keeping the token for a later
revocation); floor and chamber lists per facility need a server setting; the
server's search does not fold Gujarati digits itself; `get_supervisors` still
returns mobile numbers that the app no longer reads.

## Unreleased — roles, reports per account, the sign-in guard and photo removal from the 2026-10-10 review

**Needs backend migration 45** (`00000000000045_role_allowlist_alignment.sql`,
"the server admits what the app offers"). Deploy the backend first: without it
staff are refused the reports, item pricing, sensors and photo removal that the
app now offers them, and supervisors are refused every change in Users.

- One meaning of "staff". The app had two flags called `isStaff` that meant
  opposite things (administrator or supervisor in one place, the staff role in
  another). They are replaced by `isWarehouseUser` (administrator, supervisor,
  staff), `isManager` (administrator, supervisor) and `isCustomerAccount`, in
  `src/config/roles.ts`, with one table of who is offered which screen.
- Reports for staff: Stock summary, Stock aging, Customer activity, Dispatch
  activity and Invoice history open with all customers for a staff account, as
  GRN activity already did. Before, they showed "No customer linked". The
  Operations dashboard stays with administrators and supervisors.
- Reports for a customer account with more than one customer: every report
  first asks which customer ("Choose a customer"), then shows that customer;
  Back returns to the choice. Before, these accounts were sent to the
  all-customers reports, which the server refuses, and saw an error on six
  reports. An account with one customer opens it directly, as before.
- Item-wise stock sends the customer for a customer account, on the list and
  on the GRNs under an item (the per-customer request). Before, it asked for
  every customer's stock and was refused.
- Settings: Item pricing and Sensors are shown to administrators, supervisors
  and staff. A customer account no longer sees them (both ended in a server
  refusal) and has no Features section.
- Item pricing: staff can add, change and delete prices, and get the price
  pencil beside an item group in the invoice form (the server allows it from
  migration 45). A customer account cannot open the price form.
- Users: a supervisor can change the role, status and customer assignments of
  users who are not administrators. For an administrator, and for the
  supervisor's own profile, the role, the status switch and the Add and Remove
  customer buttons are not offered; the role list never has Administrator for
  a supervisor. An administrator still cannot change the own role or status.
- Signed out: every screen except sign-in, the code step, facility choice,
  waiting for approval, Terms and Privacy now goes to sign-in, also when it was
  opened by a link (reports, Customers, Items, Users, Item pricing, Sensors,
  Sort and filter and the rest showed an error with no way to sign in). The
  check waits until the stored session has been read, so a signed-in person is
  not sent to sign-in on start.
- Signed in: opening the sign-in screen (for example with Back after signing
  in) goes to the home tabs. A screen that the role is not offered (Customers,
  Items, Users, Item pricing, Sensors, Operations dashboard, Enrollment review)
  goes to the home tabs when opened by a link, instead of showing the list with
  buttons the server refuses.
- Links: a web address (`https://…`) is no longer read as a screen of the app,
  and a link that arrives during sign-in does not replace the sign-in or code
  screen.
- Photos: removing an uploaded photo in the dispatch review step that the
  server refuses, or that fails, now says why and keeps the photo. Before, the
  photo disappeared from the form and was still on the dispatch. A refused
  removal names the reason ("You do not have permission…") instead of "check
  your connection".
- GRN and dispatch details: a supervisor without a mobile number in the answer
  (the server no longer sends it to customer accounts) is shown by name, with
  no Call action.
- Invoice details load again when the screen comes back into view, so Back
  after an edit shows the new amounts.
- Smaller: Edit and Delete in the detail screens are hidden unless the screen
  says the role may; a detail tab's badge is read as "Images, 3" (it said
  "3 items" for every tab); the photo filter chips of a GRN keep screen-reader
  focus when tapped; GRN and dispatch photos are no longer written to the
  device's image cache (their addresses change on every load, so the copies
  were never reused); a failed dispatch-history load on a GRN shows the app's
  words, not the database's; the profile, own-profile edit and item edit
  screens no longer write names, ids and whole records to the device log.

Not done here, each needs something outside this change: a signed-out or
wrong-role redirect has unit tests but was not run on a phone; the price form
still downloads up to 500 prices to show one (needs a server filter by price
id); photos cached by earlier versions stay in the image cache until the
system evicts them; the tabs still restore the session a second time on start.

## Unreleased — reports, dates, list filters, sign-in limits and the build audit from the 2026-10-10 review

Works against the same backend migrations as the entries below (up to 44). No
new migration is needed, but two things are only fully right after a backend
change that has not been made yet; they are listed at the end.

- Reports: a report the server refuses (no permission for the customer, or a
  fault inside the report function) now says so, with the reason. Before, every
  report showed "0 GRNs / 0 stock / 0 invoices" as if there were nothing. The
  same for the recently ordered items of a customer and the GRN picker of the
  dispatch form, which showed an empty list. The Operations Dashboard names the role refusal.
- GRN date: a date chosen in the date picker is saved as that day. Before, it
  was saved as 18:30 UTC of the day before, so the reports counted the GRN a
  day early and stock aging was a day high. A GRN saved that way is put right
  the next time it is edited and saved.
- New dispatch: the default date is today as a day, like a date chosen in the
  picker. A dispatch made between midnight and 05:30 was filed under the day
  before.
- Date filters on the GRN, dispatch and invoice lists cover the chosen days in
  Indian time whatever the phone's time zone is. For customer accounts, a GRN
  date filter with only "from" or only "to" now filters (the server ignored a
  range with one end).
- Reports: "Last 120 days" and the other periods cover the same days in every
  report (Customer Activity covered one day more).
- Orders queue: an order whose items cannot be loaded shows the reason and
  "Try again". Before, the card asked the server again without end while it
  was open.
- GRN details, Dispatches tab: a GRN line saved without a weight no longer
  breaks the tab. The Items tab no longer shows "0 kg" for such a line.
- Search and filters:
  - a number range typed in small letters ("a0010-a0020") or the wrong way
    round finds the documents; before, it found nothing while the chip showed
    the range as applied;
  - two dates ("01/04/2025 - 31/03/2026", "1 apr to 30 apr") are read as a
    range;
  - Gujarati, Devanagari and Arabic-Indic digits are read as 0-9 everywhere,
    also in the Package and GRN-number filters;
  - the invoice-number filter shows numbers as written (1200, not 1,200 or
    ૧,૨૦૦);
  - one letter in a search field shows "Type at least two letters to search";
  - "Today" follows the calendar when the app stays open past midnight, and
    the invoice Year filter has the new financial year from 1 April;
  - a customer taken away from a customer account is dropped from its stored
    filter;
  - the "Recent" searches are forgotten when a session ends.
- Sign-in (backend migration 44): when the server says how long to wait for
  another code, the countdown starts from that time (60 seconds, or 15 minutes
  for a number that has used up its hourly codes). "Too many codes requested"
  and "Too many new access requests today" have their own messages.
- Users: the last administrator cannot be deactivated, given another role or
  delete the account; each case has its own message (the role and status
  screens showed the code `LAST_ADMIN`).
- Messages from the server in Gujarati: an invoice whose dispatch lines
  changed, a discount above the invoice amount, a missing discount reason, a
  wrong mobile number and a missing customer assignment are named. An English
  sentence that contains a Gujarati item name is no longer shown as it is.
- A search answer that arrives late no longer replaces the results for what is
  typed now (shared pickers, report customer search). A dispatch card shows
  its changed lines after a reload. A request the server refused for the
  session or permission is not repeated three times before the message.
- Privacy: the report services no longer write the request, the answer or the
  token state to the device log; list load errors are logged in development
  only.
- Build check: `npm run audit:artifact` fails on any Android permission that
  is not on the reviewed list in `scripts/artifact-audit.mjs`
  (`EXPECTED_ANDROID_PERMISSIONS`), not only on the blocked ones. A dependency
  upgrade that adds a permission now needs a decision: block it in `app.json`
  or add it to the list.

Still open on the backend (the app cannot fix these):

- The report RPCs bucket dates with `::date` in the database's time zone,
  which nothing pins (migration 41 pinned only the invoice duration to
  Asia/Kolkata). GRNs that were saved with a picked date before this change
  are stored at 18:30 UTC of the previous day and stay one day early in the
  reports until they are edited, or until the report functions use the
  business date or a migration moves those rows.
- `get_customer_grn_items` and `get_customer_dispatch_items` ignore a date
  range that has one end; the app fills the other end in.
- The Package filter matches differently on the GRN list and the dispatch
  list (M4-13), and customer accounts' lists are still paged by offset (M9-7).

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
