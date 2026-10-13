# Changelog

## Unreleased — Settings and Reports UX review fixes (2026-10-13)

Backend PR #96 (report PDF filters) merges first; the app falls back with consent on an older server.

### Settings

- **One set of account actions in Settings and Profile (SR-01).** With central login, "Leave this facility" and "Sign out of this phone" say what each ends; Profile no longer promises a phone sign-out that keeps the association sign-in.
- **Edit profile names the real role (SR-07)** (Staff, Admin, Customer) instead of "User".
- **A failed customer-access lookup says so and offers Retry (SR-08),** keeping the typed name; it is no longer shown as "no access".
- **Deleting a facility account names the facility (SR-09)** and says that the association sign-in stays.
- **Settings and Profile show the real app version and build (SR-12),** with "Share these details" for support.
- **The deletion warning no longer promises to erase preferences the phone keeps (SR-13);** an empty confirmation field never matches.
- **The deletion confirmation keeps its buttons above the keyboard (SR-15).**
- **Settings is grouped as Warehouse tools, Preferences, Account, Help and about (SR-O02).**
- **The Settings button is a gear icon (SR-O03)** in the tab headers.
- **Preferences are compact rows that open a sheet (SR-O04);** the language sheet reopens after the language change rebuilds the screen.
- **The language row says it belongs to this phone (SR-O05);** the phone's choice is not uploaded at sign-in, a change made while signed in is uploaded once.
- **Self-edit is "Change name" (SR-O06),** with the account details collapsed and the customer access in plain words.
- **A Help screen (SR-O07):** who to ask, roles, what to do on a new phone or number, and the app details.

### Reports

- **Item stock figures keep their meaning under a search for every sort (SR-02):** "All items" and "All stock" come from the whole list, and the time shown is that of the figures.
- **Sharing a PDF never silently widens the report (SR-03).** The filters and search are sent to the server; when the PDF cannot apply them (an older server, a search it does not take) the app asks before sharing the full report, and a cut-short PDF is said so.
- **Stock aging counts lots as lots (SR-04):** "Stock lots" and "Lots over 364 days", with a footnote that items are counted by name.
- **The item stock drill-down shows more than 100 GRN lines (SR-05)** with "Show more GRN lines".
- **A search stays with the customer it was typed for (SR-06);** opening a customer clears only the search, a card's "View …" clears the search and the choices.
- **Coming back to a report after 30 seconds or more refreshes it (SR-10),** reports are refreshed after GRN, dispatch and invoice changes, and a kept copy says "Saved copy, refreshing…".
- **The stock trend no longer shows future months or calls the current month a month-end (SR-11);** the current month is "as of" today.
- **Customer activity and Operations separate period totals from current stock and latest activity (SR-14),** under "In <period>", "Right now" and "Latest … (any date)".
- **Every period report has Today, Yesterday and Last 7 days (SR-O01):** customer activity, GRN activity, dispatch activity, invoice history and Operations.
- **Customer cards sorted by invoiced amount show that amount (SR-O08).**
- **The Reports tab names each report by what it shows (SR-O09):** stock by customer, stock by item, "View stock age".
- **Long customer names and chart labels fit (SR-O10):** cards stack under large text or long names; charts leave headroom.
- **Reports show the facility name in their headers (SR-O11),** and so does the Reports tab.

### Follow-ups

- **The print range dialog keeps Print above the keyboard (SR-15 follow-up):** the two number fields scroll and the buttons stay below them, as in the deletion confirmation.
- **Operations no longer says "in this period" when the latest activity is empty (SR-14 follow-up):** that list is of any date, so it now reads "No GRNs or dispatches yet. The latest ones appear here."
- **The version footer shows the version and build of the installed app (SR-12 follow-up),** read with the new dependency `expo-application` (~57.0.3), not the embedded app.json number an EAS build with remote versions may leave at 1; Expo Go and missing values fall back to the embedded config. The Play install-referrer permission its Android library asks for (`com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`) is removed from the manifest by a config plugin in `app.config.js`.
- **Stacked customer cards no longer leave a wide gap above the PDF button (SR-O10 follow-up):** the icon sits a small gap under the facts; its touch area is still full size, below the row.

## Unreleased — performance review fixes (2026-10-13)

No backend change.

### Performance

- **Fewer reads of the saved sign-in (DATA-01).** Each request reads the stored session once instead of twice, and requests made at the same moment share one read: 20 at once now cost 4 reads instead of 160.
- **Scrolling a GRN list of several customers no longer downloads earlier pages again (DATA-02).** Ten pages now take 10 requests and 800 rows instead of 84 requests and 7,600 rows. Sorted by date, oldest first, the rows keep the order shown before, rows without a date included.
- **Photos upload four at a time (MEDIA-2).** Saving a GRN or dispatch with many photos no longer starts every upload at once or holds every photo in memory together.
- **Lists load once (R1).** Opening the Orders, Order queue, Invoices or Dispatches list, or changing a filter on it, loads it once instead of twice; coming back to a list after a change made elsewhere loads it once more.
- **Signing in opens the tabs without restoring the session again (R2).**
- **Sensor screens stop asking for readings while hidden (R3),** and one request at a time runs while they are shown.
- **Changing the sensor history period sends one request (DATA-03),** and only the history area shows that it is loading.
- **Print job status is polled less often (DATA-04):** about half as many requests while a job runs, and only a few a minute while nothing is printing; nothing after the sheet is closed.
- **Order lists listen for live changes only while shown (R4),** and joining live updates no longer reloads a list that has just loaded. The order editor and the Orders and Order queue lists still load once when the app comes back to the foreground or the phone comes back online while they are shown.
- **The dispatch list kept for offline use stays small (DATA-05):** older pages and filters are dropped instead of filling the phone's storage.
- **A customer's history is forgotten at sign-out (DATA-06),** and only the last few customers opened are kept in memory.
- **Long invoice pricing, GRN review and dispatch review forms draw only the rows on screen (UI-1);** typing a rate redraws only its own group.
- **The order editor redraws only the lines that changed (R6)** when the order is refreshed.
- **Opened groups in the stock summary and stock aging reports scroll smoothly (UI-2),** even with hundreds of lots under one item.
- **Changing rates on a long invoice stays quick (F1);** grouping 1,000 dispatches no longer takes half a million comparisons.
- **A camera photo is encoded once instead of twice (MEDIA-1).**
- **Photos taken or prepared by the app are deleted from the phone once nothing needs them (MEDIA-3):** when removed from a form, when a form is reset or discarded, after a confirmed upload, at sign-out, and at start-up for files older than seven days. A photo kept for a retry stays until it is uploaded, also when the upload could not start, and goes when it is given up with "Continue without photos" on a GRN or at sign-out.
- **"Next" on the GRN items step with nothing changed does no work (FORM-1),** even on a GRN with hundreds of lines.
- **A shared PDF larger than the limit is stopped while it downloads (F5),** instead of after all of it has been downloaded into memory.
- **The sensor countdown no longer redraws every sensor row each second (R5).**

## Unreleased — backlog fixes outside central login (2026-10-13)

No backend change.

- **A link with a query is opened once (backlog A26).** A link into the running app that
  carries a query (for example `warehousemanager://reports/stock-aging?customerId=…`) was
  handled twice: expo-router opened the route, then `useColdStartDeepLink` compared the shown
  path (which has no query) with the link including its query, found them different and
  replaced the screen, which mounted and fetched again. The same happened to a link that
  started the app, once the sign-in was restored. Both comparisons now use the link's path
  alone. A link to another path is still opened.
- **`npm run typecheck:tests` reports no errors (backlog A6).** The 50 type errors left in 22
  test files of the reports work and of shared code are typed away: casts of the mocked
  component tags (as `OperatorServerSelectionKeyboard.test.tsx` does), `jest.mocked(...)` for
  mocked functions, typed fake answers and props the components no longer take. No assertion
  changed, no test removed or skipped, and each of the 22 files runs the same 380 tests as
  before.

## Unreleased — reports (2026-10-12)

No backend change is needed for the entries below unless an entry says so
(item stock summary, report PDFs and their payment filter, dispatch weights).

- **Reports tab: pinned, recent and categories.** The tab now shows the reports
  you pinned (in the order you pinned them), up to three you opened last, then
  every report you may open under Stock, Movement, Financial and Operations. A
  star at the end of each row pins or unpins the report (filled when pinned;
  the screen reader says "Pin … to the top" / "Unpin …" and whether it is
  selected). Pins and recent reports are kept per facility and account. A
  pinned or recent report that the account's role may not open, such as the
  operations dashboard for staff and customer accounts, is never shown.
- **Stock age bars (stock aging, customer activity).** Both reports draw the
  stock-age buckets with one shared component, `AgingBucketBar`. Each bar shows
  its bucket's share of all stock, so the four bars add up to 100%, instead of
  its share of the largest bucket. The share is worked out from quantities on
  both screens: the stock aging report used to show the backend's share of
  stock entries, so its percentages change. Every quantity shows its unit, a
  screen reader reads the group as one summary with a sentence per bucket, and
  a customer with no stock sees "No stock yet". The "Over 1 year" KPI is
  unchanged for now: its backend count uses more than 365 days while the last
  bucket is over 364 days; the stock aging rebuild aligns it.
- **Stock reports share one item card.** The stock summary and the item stock
  summary draw their items with `StockItemCard` instead of two copies. GRN
  numbers are shown in full and wrap instead of being cut off. Opening an item
  animates for 200 ms instead of 300 ms, and not at all with Reduce Motion on.
  The item header tells screen readers whether it is open; a GRN row that opens
  the GRN reads as one button with the hint "Opens the GRN", and a row that
  cannot open has no chevron. In the item stock summary the item's packaging
  and GRN count share one line, and "Low stock" is the only tag.

Fixes on the report screens:

- **Invoice history** now shows its figures (invoices and amount for all
  customers; invoices, paid and pending for one customer). They were worked
  out but only ever drawn as a loading placeholder.
- **Invoice history, one customer: the Monthly breakdown now adds up.** The old
  table mixed the invoice totals (right) with paid and pending sums that
  counted labour and tax twice, so the columns did not add up (for example
  Amount 699 against Pending 818 with Paid 0). The table is now built in the
  app from the period's invoices, using each invoice's total, with the columns
  Month, Invoices, Amount, Paid and Pending. Paid plus Pending is the Amount
  when every invoice is paid or pending; an invoice with any other status
  counts in Invoices and Amount only. The table covers every invoice of the
  period: the search and the Paid or Pending choice do not narrow it. No
  backend change.
- **Report days follow India's calendar (Invoice history, GRN activity).** The
  months in the Monthly breakdown, and the date headings in the invoice history
  and GRN activity reports, now use the calendar day in India. An invoice or a
  GRN made between midnight and 5:30 am India time sits under its own day and
  month, whatever the phone's time zone. GRN activity also drew one heading per
  moment when two GRNs of a day had different times; it now draws one heading
  per day.
- **Stock summary**: a customer with nothing in stock can see their
  out-of-stock items. The "no stock" message used to replace the whole screen.
- **Item stock summary**: a search typed while a load was in flight is no
  longer dropped, and an older answer can no longer replace a newer one. A
  GRN list that failed to load says so and offers "Try again"; it used to read
  "No GRNs with this item in stock".
- **Dispatch activity** asks the server once on opening, not twice, and no
  longer asks for every customer when it was opened for one.
- Dispatch activity, GRN activity and Invoice history show a failure the same
  way (error tone, one "Try again" that shows the loading state), and their
  "no customers match" state offers "Clear search".
- Three texts that were always English follow the app's language.
- The eight reports are listed in one table
  (`src/features/reports/reportRegistry.ts`) that the Reports tab and the
  route declarations both read; all eight routes are now declared.

**GRN activity report** is the first report on the shared report layout
(`ReportScaffold`). Its period is a chip in the filter bar next to a sort, and
both are remembered after the app is closed; a search finds customers, or GRNs
by number, sender, vehicle, invoice or item, with the match in bold, and one
customer's GRNs can be narrowed to invoiced or not. A line under the figures
gives the dates, how many rows are shown of how many and when they were read;
a failed refresh keeps the rows and says they are not current. A customer
opens on a page of its own, so the phone's back button returns to the list,
and the customer opened last is offered above the list. Date headings appear
only while GRNs are sorted by date.

The other report screens on the shared layer, and the work they build on:

- **Stock summary on the shared report layout.** The stock summary now has the
  same layout as GRN activity: search and sort (stock, items, GRNs, name for
  customers; stock, name for items), "Clear all" that keeps the sort, the sort
  remembered per facility and account, the last-opened customer shown above
  the list, and pull to refresh that keeps the old figures with a "Couldn't
  update" note. A customer's items can be searched by item name or GRN number;
  a closed item names the GRN it matched. The out-of-stock section (last 360
  days) still shows when nothing is in stock. Sharing a stock PDF keeps each
  customer's button busy on its own, says so in an alert when the PDF can't be
  made or shared, and keeps letters of any script in the file name. The
  per-row share button is its own target for screen readers. No backend
  change.
- **Stock aging.** Rebuilt on the shared report layer. Customers can be
  searched by name and sorted by average age, stock or name; the sort is
  remembered, and the last opened customer is offered. One customer's items
  can be searched by item or GRN number, sorted by age, stock or item, and
  filtered by age bucket. Each GRN line now opens on its own (two lines of one
  GRN used to open together). The item tag reads "Oldest N days" and the
  customer tag "Average: \<bucket\>". Details stack at large text. **KPI
  change:** the oldest-stock figure is now `by_bucket['364+'].item_count`,
  labelled "Over 364 days", so it matches the bar; it used to be the RPC's
  `items_over_365_days`, which counts from 365 days. No backend change.
- **Customer activity.** Rebuilt on the shared report layer, with the period
  chip, a customer search, and sorts by last active, stock, invoiced amount or
  name. The customer dashboard keeps the stock trend: full-screen chart or
  table, chart/table switch now full touch targets, y-axis numbers formatted
  with a unit, and an empty state. Quick-access cards open their report for
  the customer and are counted from the period totals. GRN, dispatch and
  invoice preview rows open the document. No backend change.
- **Item stock summary.** Now on the shared report layer. The server searches,
  sorts (item name, stock, received quantity, GRN count) and pages it, and the
  Stock figure is the server's total for the whole filtered list. **Needs
  backend migration 52** (`get_item_wise_stock_list` with
  `p_sort_by`/`p_sort_order` and `data.summary`); deploy the backend first.
  Against an older backend the app asks once more without the sort and stops
  asking for that facility; it then sorts only the items already loaded and
  shows "—" for Stock until every item is loaded. "Showing N of M", a
  load-more footer with "Try again", and the GRNs read when a card opens all
  work as before.
- **Operations dashboard.** Now on the shared report layer, with the period
  chip the other rebuilt reports use instead of its own period selector. Recent
  activity rows no longer look tappable (they carry no document id), and their
  reference reads the same on screen and to a screen reader. Still for
  administrators and supervisors only; a refusal from the server shows its
  reason. No backend change.
- **Dispatch activity** is built on the shared report layer: the period, search
  and sort are in the filter bar, and the period and sort are remembered; a
  warehouse role opens a customer as its own page, and the customer opened last
  is one tap away; customers sort by bags, dispatches or name; a customer's
  dispatches search by number, supervisor and item names (a closed card names
  the item it matched) and sort by date, number and bags, and by weight when
  the server sends weights (backend migration 58; see "Dispatch activity:
  weights"), with date headings only under the date sort; opening a dispatch is
  its own target beside the card, not a button inside it; an item row is read
  with its weight, the "of N" quantity, rack and mark; an empty report no longer
  suggests a longer period when the longest is chosen. No backend change,
  except for weights (migration 58).
- **Invoice history** is built on the shared report layer: each customer row
  shows its amount, and customers sort by amount, invoices or name; a
  customer's invoices search by invoice number, GRN and item names, sort by
  date, number or amount, and can be narrowed to paid or pending; the
  figures (invoices, paid, pending) always cover the whole period; the monthly
  breakdown is a table with the month column fixed and a totals row, collapsed
  until opened; a payment status other than paid or pending shows as "Unknown"
  instead of "Pending"; opening a customer from a link no longer shows two
  placeholder tiles before the three real ones. No backend change.
- **Report PDFs.** Every report except the operations dashboard can be shared
  as a PDF with "Share PDF" in its header, for all customers and for one
  customer; the PDF follows the period and the sort on screen (a sort the PDF
  has no column for leaves the PDF in its own order). `generateReportPDF` in
  `src/services/pdf-service.ts` calls the backend's `generate-report-pdf`;
  `useReportExport` runs the export and
  `reportPdfSort` (`src/features/reports/reportPdfSort.ts`) holds the one table
  of sort names. Failures are shown in a dialog in the app's language; a share
  that fails gives the share sheet's own reason (for example "Sharing is not
  available on this device"). File names keep letters of any script (shared PDF
  file names now keep letters, vowel signs and digits of any script, capped at
  100 characters and 200 bytes), and a name with none falls back to the start
  of the customer id. **Needs the backend release with migrations 52–53 and the
  `generate-report-pdf` function.** With an older backend the first export
  shows "This facility's server needs an update before reports can be shared
  as PDF." and the export action is hidden for that facility until the app is
  restarted; the stock summary instead falls back to the facility's existing
  stock PDF (`generate-customer-stock-pdf`) for a customer's row and for one
  customer's header, with no message, and hides only the all-customers PDF,
  which has no older version.
- **Refusals in any language.** Every report refusal carries a machine code
  (the server's 42501, else `ACCESS_REFUSED`), and the operations dashboard's
  `STAFF_ONLY` is recognised as a refusal too, so a refusal shown in Gujarati
  without a server code is still treated as one.
- **Last figures kept on the phone.** Reports opened after the app was closed
  show their last figures at once, with the time they were given, and refresh
  behind them; if the refresh fails the figures stay with the "not updated"
  message. The copy is kept on the phone per facility and account for at most
  three days, skips very large answers, and is removed with the other caches
  at sign-out and facility switch. A refusal from the facility (the account
  lost its role or the customer) removes the kept answer and drops the figures
  on screen, so the report shows only the refusal.
- **Cleanup.** Removed the report components no screen used after the rebuild
  (`PeriodSelector` with `getDateRangeForPeriod`, `ReportCustomerSearch`,
  `ReportCustomerScope`), the old `ReportPeriod`/`CustomerActivityPeriod`/
  `ReportDefinition`/`ReportCategory` types in `src/types/report.types.ts`, and
  the English and Gujarati texts only they used. The report registry test now
  renders the root stack instead of matching its source text.

Review fixes (2026-10-12):

- **Stock screens.**
  - Stock aging: the oldest-stock figure now reads "Items over 364 days" and
    matches the red bar; customer rows no longer show a separate "over 1 year"
    count, and their average age wraps instead of being cut.
  - Stock summary: the items that ran out are rows of the list under an "Out of
    stock" header that opens and closes them, so long lists scroll smoothly; a
    search that finds only items that ran out says so and opens them; the
    header action reads "Share PDF" and the quantity figure "Stock", as on the
    other reports; an item with no GRNs says so when opened.
  - Stock reports: a GRN's package mark is shown in full in the row's details
    instead of in a tag that could cut it.
- **The shared report layer and filter kit.**
  - "Last updated" gives the date as well as the time for figures kept from an
    earlier day, and is never cut off; screen readers announce the "Showing X
    of Y" count after a search.
  - Every filter chip, choice chip and recent-search chip can be tapped across
    the full 48 dp (Android) / 44 pt (iOS) target, not only the 36 dp pill; the
    filter bar keeps one height.
  - While a report first loads, screen readers hear "Loading figures" once.
  - The sort chip's spoken label uses the full field name.
  - Filter sheets and the full-screen stock trend chart fade instead of
    sliding when Reduce Motion is on.
  - With large text (above 1.2×) the figure tiles show two across.
  - The last row of a report and of the customer picker is no longer hidden
    under the system navigation bar; empty states can offer a button, and
    period reports offer "Show last 420 days" until the longest period is
    chosen.
  - The search field keeps its clear button during a background refresh; the
    spinner shows only for a server search (item stock), also while a new
    search is first answered.
  - A double tap on a report or a customer row opens it once.
- **Item stock summary, report queries, kept figures and PDFs.**
  - Item stock summary: opening an item no longer closes when an earlier
    item's GRNs answer late, after a search or a pull to refresh.
  - Item stock summary: an opened item says "Showing 100 of N" under its GRNs
    when it has more than the 100 shown.
  - Item stock summary: the Items and Stock figures stay those of every item
    while a search is typed.
  - Item stock summary: a pull to refresh keeps the items loaded below the
    first page until the new first page arrives, and keeps them if the refresh
    fails; no next page is loaded against a page still being refreshed or
    shown from the phone.
  - Item stock summary on a facility server without migration 52: a note says
    the order covers only the items loaded, and Share PDF is not offered.
  - Reports keep only first pages without a search on the phone, so other
    reports' saved figures are no longer pushed out.
  - Reports show their own wording, not the server's or the system's, when a
    report cannot be loaded; access refusals still show the facility's reason.
  - When the facility refuses a customer's report, that customer's saved
    figures for every period are removed, not only the period asked for.
  - Share PDF says how many rows a shortened PDF holds before sharing it, and
    shows plain wording instead of system error text when sharing fails.
  - PDF file names for all customers say "All customers" in the app's
    language.
- **Shared report parts and wording.** Every report says "No customer linked"
  in the same words when a customer account has none (it was worded four
  ways); GRN activity's failure reads "Couldn't load GRN activity. Check your
  connection and try again." instead of "Failed to fetch GRN activity";
  customer activity's quick-access cards and stock trend axis count bags, as
  every other report does, instead of "units"; and a stock trend whose months
  are all 0 says "Highest 0" instead of "Highest 1". The no-customer state,
  the date heading over a day's rows and the header's "Share PDF" are one
  shared part each (`ReportNoCustomer`, `ReportDateHeading`,
  `exportHeaderActions`) instead of a copy in each screen.

After the device runs (2026-10-12):

- **Rows that tie.** Rows with equal sort values (for example several
  customers with the same bags) appear A to Z by name in both directions
  instead of in server order.
- **Reports tab.** When Recent or Pinned appears at the top, the tab scrolls
  up so it is visible.
- **Search fields (lists and reports).** Pressing the clear (×) button also
  closes the keyboard.
- **Report customer cards (stock aging and the other customer reports).** The
  status tag, such as "Average: 121–240 days", sits on its own line under the
  subtitle instead of in the value column, so names and subtitles no longer
  shrink to a sliver at large text sizes; a subtitle may use two lines.
- **Status tags.** A tag's label can no longer draw wider than its box in a
  narrow column.
- **Avatars (everywhere).** Initials come from the first letter or digit of
  the first two words that have one, so a name that starts with an emoji or a
  symbol, such as "🧊 Ice Depot", shows "ID" instead of a broken character.
  Other names and all colours are unchanged; the customers list and the
  profile use the same rule.
- **Item stock summary.** A facility whose server has no item sort is noted
  as one info line in the log instead of an error; the report works as
  before.
- **Invoice history (Monthly breakdown).** Table headers stay on one line and
  shrink slightly before they are cut, and the Invoices column is wider, so
  "Invoices" no longer breaks as "Invoice / s" at large text.
- **Dispatch activity, one customer.** The Weight sort is removed, because the
  server sends no weight for a dispatch and the sort changed nothing; a Weight
  sort remembered from before opens on date, newest first. Since changed: the
  Weight sort is offered again when the server sends weights (see "Dispatch
  activity: weights" below).
- **Dispatch activity: opening a dispatch.** The control that opens a dispatch
  from its card appears only when the server sends the dispatch's id, which
  **needs backend migration 57**; against an older backend the cards open and
  close as before and have no such control.
- **Dispatch activity: weights.** When the facility's server sends dispatch
  weights, each dispatch card of one customer shows the dispatch's weight (kg)
  on its own line under the bags, a screen reader hears it with the card, and
  the sort sheet offers Weight. This **needs backend migration 58**:
  `get_customer_dispatch_activity` then returns `total_weight` (kg) for each
  dispatch and `weight` for each item line. Deploy the backend first. Weight is
  offered while a dispatch of the period has a weight above zero. On an older
  backend nothing changes: no weight on the cards, the sort options are Date,
  Dispatch number and Bags, and a Weight sort remembered from before opens on
  date, newest first (the remembered choice is kept and comes back once weights
  are sent). The report PDF has no weight column, so a PDF shared while sorted
  by Weight is in its own order.
- **Start-up.** Neither `reportPrefsSlice` nor `listFilterSlice` imports
  `authSlice` any more. Both react to sign-out by the action's type string,
  `'auth/logout/fulfilled'`, so the "Require cycle" warning at start-up
  (`authSlice` to `sessionScopedState` to the slice and back) is gone. A test,
  `src/tests/storeRequireCycle.test.ts`, fails if anything imported by
  `sessionScopedState` imports `authSlice` again.

After the seed-data check (2026-10-12):

- **Invoice history shows the invoice total.** The report used the server's
  "net" figure. On a server without backend migration 61 that figure counts
  labour and tax a second time and takes the discount off a second time: one
  customer showed 818 where the real amount is 699, and one discounted invoice
  showed as a negative amount. The invoice cards, the Monthly breakdown, the
  Paid and Pending tiles and their counts (now worked out in the app from the
  period's invoices), the all-customers amount, the customer rows and the sorts
  by amount now use the invoice total. It is the same figure as the invoice
  list, the invoice screen and the invoice PDF. The label is "Amount", no longer
  "Net amount". The amount of each invoice is right on servers with or without
  backend migration 61; such a server also lists an invoice once per payment,
  which "Fixes after the independent review" below repairs for one customer's
  screen. The customer activity report's invoiced amounts and the report PDFs follow the
  server and are right from backend migration 61. The Monthly breakdown is
  described above.
- **Invoice history, Monthly breakdown: paise.** When any amount in the table
  has paise, every amount cell (rows and Total) shows two decimals, so Paid plus
  Pending equals the Amount and the rows add up to the Total. A table of whole
  rupees looks as before, and the figure tiles stay in whole rupees. The amount
  columns are wider while paise are shown, so a large amount is not cut.
- **Invoice history, one customer: Share PDF follows the Payment filter.** With
  Paid or Pending chosen, the PDF holds only the paid, or only the pending,
  invoices of the period. The search does not narrow it. **Needs the backend
  release with migrations 59 to 61**, where `generate-report-pdf` accepts the
  optional `status` field. On a server without it nothing is shared: the app
  says that the facility's server can't filter the PDF by payment yet, and to
  remove the Payment filter or ask for a server update. Exports without the
  filter still work there. (At first the app asked once more without the filter
  and shared the PDF of all the period's invoices with no warning; changed
  after the independent review, below.)
- **Every report date follows India's calendar.** This extends "Report days
  follow India's calendar (Invoice history, GRN activity)" above to all the
  reports, on a phone in any time zone: card dates, "Latest" dates, "Active
  today", the GRN dates in stock aging and in an item's stock, older activity
  on the operations dashboard, and "Today" and "Yesterday" in date headings.
  The period sheet shows the same two days the request sends, and a report
  asks again when the day turns over in India. The year that a short date
  leaves out is India's current year on every screen. The GRN, dispatch,
  invoice and pricing lists are unchanged and still use the phone's own today.
  Nothing changes on a phone in India. The app needs no backend migration for
  this; the stock reports' server-side days follow India's calendar from
  backend migration 60.
- **Dispatch activity: the weight has its own line.** A dispatch card's weight
  now sits on its own line under the bags, at the same right edge on every
  card, so a long weight no longer wraps the dispatch number. A card without a
  weight is unchanged. See "Dispatch activity: weights" above.
- **Data table: the totals row.** A screen reader now reads the totals row as
  one element that names each column with its total, as it already read a data
  row. Before, it read the bare figures one at a time. Invoice history's
  Monthly breakdown is the one table that draws a totals row.
- **Customer activity: the stock trend.** The trend draws the month in
  progress at the Stock tile's figure, so its latest and highest figures no
  longer fall below the tile. The same holds for any later month of a period
  that runs past today. Finished months keep the server's month-end figures.
  Why the server's two figures for the month in progress differed for one
  customer has not been found.
- **Gujarati.** The pin label on the Reports tab was corrected after a wording
  review: "… સૌથી ઉપર પિન કરો". A model did the review, not a native speaker.
  Five app texts and seven report PDF labels are marked as doubtful and left
  as they are, for the owner's own check, which is still open.

After device run 5 (2026-10-12):

- **Paid and Pending follow the money (invoice history).** Paid is now the
  money received and Pending is what is still owed. An invoice counts as Paid
  only when no more than ₹0.50 is owed; a part-paid invoice stays Pending with
  its balance. Until now any payment made an invoice paid for its whole amount.
  The Paid and Pending tiles, the Monthly breakdown, the Payment filter and each
  card's tag use this one rule, worked out in the app from each invoice's total
  and the payments recorded against it, so Paid plus Pending always equals the
  Amount. A part-paid invoice's card adds one line, "Paid: ₹4.00 · Pending:
  ₹10.00", which a screen reader also reads; fully paid and unpaid cards are
  unchanged. The screen is the same on a server with or without backend
  migration 62; it needs backend migration 61 for the received amount to be the
  sum of an invoice's payments. The report PDF's Paid or Pending filter, and the
  customer activity report's recent invoices and pending amount, follow the same
  rule from backend migration 62. An invoice whose status the app does not know
  no longer shows as "Unknown" here: the money decides, so with no payment
  recorded it counts as Pending for its whole amount.
- **Stock reports say "1 unit".** A stock of one reads "1 unit" on stock aging,
  the stock summary and the item cards (English; the Gujarati word does not
  change).
- **Stock aging, one customer: the Items figure counts items.** It counts the
  items shown as cards, not the stock lines (a customer with one item in two
  lots read one more than its cards). The all-customers level keeps the
  server's count.
- **Filter bar: "Clear all" at large text, not changed.** At large text sizes
  "Clear all" sits past the end of the filter row until the row is swiped.
  Pinning it at the end of the row was tried and taken back the same day: on
  the phone it left too little room for the chips, so the active filter chip
  and its remove button were cut off. The row is as it was.
- **Gujarati wording.** Five report texts were reworded after the wording
  review: "દેખાય છે" for how many rows show, "દિવસ" for the age sort, a plainer
  note that only loaded items are sorted, "એકાઉન્ટ" and "લાઇન" in the PDF
  messages. The owner's own check of the Gujarati is still open.

Fixes after the independent review (2026-10-12):

- **A refused report no longer shows earlier figures.** After a facility
  refuses an account a customer's report, figures from before the refusal could
  stay on screen or come back: a copy kept on the phone that was still being
  read, or the answer to a request sent before the refusal (another period, or
  a pull to refresh). Neither is shown or kept now; the report shows the
  refusal. A request sent after the refusal is treated as usual, so the report
  comes back when access is given back. A report also no longer stays on
  "loading" when the refused request was not the last one sent for it.
- **A report names its customer as the facility does, not as a link does.** A
  link can open a customer's report with any name written in it
  (`...?customerId=...&customerName=...`), and the report showed that name over
  the customer's real figures; the shared PDF's file carried it too. The name
  in a link is no longer read. A report shows the facility's own name: the row
  that was tapped, the customer picker's list, the account's assigned
  customers, or one lookup by id; until the facility has answered it shows no
  name. The PDF's file is named after the customer as the PDF itself names
  them. "Last opened" keeps the facility's name, and a name kept by an earlier
  version is corrected the first time that customer is opened. A customer
  account with one customer now sees that customer's name under the report
  title. Nothing about access changes: the id is still what the server judges.
- **"Share PDF" is offered again for a replaced facility server.** The note
  that a facility's server cannot make report PDFs was kept per address; it is
  now kept per address and instance, so a server replaced by a new instance at
  the same address offers the export without restarting the app.
- **Invoice history, one customer: an invoice paid in several parts is one
  invoice.** A server before backend migration 61 lists an invoice once per
  payment. The app now merges those rows: the list, the Invoices tile, the
  Monthly breakdown, the Paid and Pending tiles and the cards count the invoice
  once, with its payments added up (an invoice of 14 paid as 4 and 10 is 1
  invoice, Paid 14, Pending 0; it showed as 2 invoices, Amount 28, Pending 14).
  The Invoices tile counts the invoices listed, not the server's own count.
  Still server-dependent before migration 61: the all-customers level (its
  figures are the server's totals), the customer activity report and the PDF.
- **Invoice history, one customer: a filtered PDF is never shared unfiltered.**
  See "Share PDF follows the Payment filter" above: on a server whose PDF
  function does not know the Payment filter the app now refuses with a clear
  message and shares nothing.
- **Operations dashboard: daily averages over the whole period.** "GRNs per
  day" and "Dispatches per day" divide by every day of the period that has
  happened, not only by the days that had events: seven GRNs on one day of a
  week read 1 a day, not 7. A period that runs past today, such as "This
  month", is counted up to today in India. An average that is not zero but too
  small for one decimal reads "<0.1", never "0". "Recent activity" still shows
  the latest events whatever the period.
- **Item stock summary: the list starts again when it changed.** If the list
  changes while you scroll (an item leaves stock, or the total stock or
  quantity moves), the next page is no longer added to the old pages. The list
  loads again from its first page, at most twice in a row, so no item in stock
  is skipped and no removed one stays on screen. Needs backend migration 52 for
  the totals; without them the item count alone decides.
- **Stock aging, one customer: "Items over 364 days" counts items.** It counts
  the items with at least one lot over 364 days, not stock lines: an item with
  two such lots counts once, like the Items figure beside it. The bar still
  shows the server's quantities, and the all-customers level and the PDF keep
  the server's count.
- **Data tables on iOS.** The scrolling half of each row and of the totals row
  is now hidden from VoiceOver as it already was from Android's screen reader,
  so a row's figures are not read twice. Not checked on an iPhone.

Backend migrations this release of the reports work relates to: 52 (server
sort and whole-list totals for item stock), 53 with the `generate-report-pdf`
function (report PDFs), 54–56 (a period includes its last day; report days
follow India's calendar), 57 (the dispatch id), 58 (the dispatch weight), 59
(GRN activity weight totals; the app shows neither figure), 60 (the stock
reports cut their days on India's calendar), 61 (invoice amounts in the
reports are the invoice total; the customer activity report and the report PDFs
are right from it) and 62 (Paid and Pending follow the money in the invoice
reports and their PDF) and 63 (the GRN activity of one customer lists a GRN
once whatever its number of invoices), and the optional `status` field of
`generate-report-pdf` (the Payment filter of one customer's invoice history
PDF), which comes with the release of 59 to 61. The app works against a backend
without them, with the fallbacks described in the entries above, and nothing in
the app needs migrations 54–56. Without them these figures are wrong or
missing: the customer activity report's invoiced amounts are overstated before
61, the stock summary's GRN days are cut in UTC before 60, the PDF of one
customer's invoice history is not made with a Payment filter without `status`
(the app refuses instead), without 62 the customer activity report's recent
invoices and the PDF still treat any payment as paid in full, and without 63 a
GRN with two old invoices is listed and counted twice in one customer's GRN
activity.

## Unreleased — central login in the app (2026-10-12)

**Off unless the build sets the central origin** (`EXPO_PUBLIC_CENTRAL_ORIGIN`). Without it
nothing changes: one facility at a time, that facility's own SMS sign-in, the same screens
and route decisions. With it the app needs a **central identity service**
([central-identity-template](https://github.com/abhiguru/central-identity-template)) and, at
every facility that takes part, **facility backend migration 49** (`central-exchange`, with
the operator's `CENTRAL_ISSUER` set to the same issuer). The design, the flow as built and
what is still open are in [docs/CENTRAL_LOGIN.md](docs/CENTRAL_LOGIN.md). Run on an Android
phone against the development central service on 2026-10-12 (the walkthrough of plan D17 by
hand, 44 of 45 steps on an earlier commit, and as 18 Maestro flows on the code of 21:24, all
passed; with central login off, plans D18 to D20 and the smoke flow); what has not been run is
listed under "Not tested" there.

- **Build settings** (`src/config/envConfig.ts`, `.env.example`):
  `EXPO_PUBLIC_CENTRAL_ORIGIN`, an `https://` origin (a development build also accepts
  `http://localhost:PORT` and `http://127.0.0.1:PORT`), and `EXPO_PUBLIC_CENTRAL_ISSUER`, the
  issuer name facilities trust (defaults to the origin).
- **Central sign-in** (`app/central-login.tsx`, `app/central-otp.tsx`): mobile number and
  one-time code at the association's service, in the layout of the facility sign-in. The
  first sign-in of a number on a phone has a terms tick box; "Send code" is disabled until it
  is ticked, and `terms_version` is sent only for a number whose tick was given.
- **The central session** (`src/config/centralSession.ts`) keeps its tokens under its own
  SecureStore keys (`secure_central_*`), apart from a facility session. One refresh at a time,
  ahead of expiry and once on a 401; a refusal signs the person out centrally and says why.
- **My facilities** (`app/facilities.tsx`): the person's own list, kept on the phone per
  central person (`central_facilities_v1:<id>`, no token in it), newest-opened first, with a
  status tag: Approved, Requested, Revoked, Confirm number, Unavailable. A status is checked
  when the facility is opened; no facility is contacted in the background, and a facility
  that cannot be reached keeps its status. With exactly one approved facility and nothing
  waiting, the list is skipped at start.
- **Add facility** (`app/facility-catalogue.tsx`): the association's catalogue, searched by
  name or city, or "Enter address" (typed or scanned) for a facility that is not listed.
- **Opening a facility** (`src/config/openFacility.ts`): discover it, switch to it with the
  existing server-switch cleanup, get a token for that facility from the central service and
  hand it to the facility's `central-exchange`. A session enters the facility; a waiting
  request shows the existing waiting screen; a profile that existed before is linked once
  with a code the facility sends ("Confirm your number at <facility> once"); every refusal
  is a plain message on My facilities. A facility that does not accept association sign-in
  is offered its own SMS sign-in.
- **Inside a facility**: Settings has "Switch facility" (with the facility's name) in place
  of "Change warehouse server", "Sign out" there signs out of that facility only, and
  "Delete account" there deletes the profile at that facility, takes it off the list and
  returns to My facilities. "Sign
  out" on My facilities ends the central sign-in and leaves the current facility; the
  account entry has the name and "Delete my account" (the association's account only; each
  facility keeps its own records).
- **Route guard**: a new state, signed in centrally with no facility session, which may open
  My facilities, the catalogue, the address entry, the linking step and the account, and is
  sent to My facilities from every facility screen. Signed in nowhere goes to central
  sign-in. With central login on the app starts without a selected server.
- **Known limit: the catalogue's signature is not verified in the app.** It is an ES256
  token and Hermes has no ES256. The app checks its type, issuer and expiry and relies on TLS
  to the configured origin. Access is decided by each facility, which verifies its own
  tokens, so a forged catalogue could show a wrong address but could not open anyone's data.
- **Server address screen and the keyboard** (`src/components/OperatorServerSelection.tsx`,
  used for the first server choice, "Change warehouse server" and, with central login,
  "Enter address"). Tapping "Check server", or the keyboard's Go key, now closes the keyboard,
  so the result card and "Use this server" are no longer hidden behind it until you close it
  by hand. On Android the screen now shrinks above the keyboard the way the sign-in screens
  do, so you can scroll to the card with the keyboard open and tap "Use this server" once.
  Nothing else on the screen changes. Not yet run on a phone.
- **Central screens and a facility's screens no longer stay under one another (review
  fixes).** Central login only; a build without it behaves as before. A facility session that
  ends on a pushed screen after the central session has ended now leaves central sign-in
  alone (it left `[home, central-login]`, and Back showed a spinner), and the same for the
  facility's own sign-in; the waiting screen's "My facilities" after a facility's own SMS
  sign-in leaves My facilities alone, with that sign-in taken off the stack (it left
  `[login, facilities]`); and Back during the central code check, followed by a correct code,
  no longer navigates from the removed code step (it put a second My facilities in place of
  the first), nor does a wrong code speak over the screen shown by then. The real-router tests
  now cover the guard's "entering a facility takes the stack down" rule and a facility's own
  SMS sign-in that clears its marker as the app does.
- **Two more fixes from the same review (central login only).** The waiting screen's "My
  facilities", followed by hardware Back before the facility's sign-out returned, replaced the
  My facilities that was already shown and mounted it a second time; when My facilities is the
  route shown (or the stack cannot be read) the return now changes nothing. And Back during the
  central code check, then a new code step, then a correct answer of the first check, left the
  person signed in on the new code step; that answer now takes the stack down to My facilities
  alone. Tests added for both, for a single approved facility opening by itself after Back
  during the code check, and for sign-in taking the stack down from a form with its own stack.
  Test only: several tests in `centralSession.test.ts` failed whenever a second boundary fell
  between two readings of the clock that built the same access token (one when the service
  stand-in issued it, one when the assertion built it again); all tokens there now share one
  issue time.
- **The stored central session and the code step (review fixes, central login only).** A code
  check overtaken by a newer check or by a sign-out while it was writing to the secure store
  answered "failed" but left its session stored (the next start signed that person in, also
  as another number); a check whose write failed could empty the session a newer check had
  just stored, or leave the app saying signed in over an empty store; and a start-up read
  that found a leftover could remove a session stored after the read. The check, the store
  write and the undo are now one queued store operation, and a leftover is removed in the
  operation that read it. (A code check that starts during a token refresh and then fails
  lost the refresh's new tokens: fixed in the next entry.) Pressing "Verify code"
  within 300 ms of the sixth digit started two checks with the same code; it starts one, and
  the code step ignores a second press made before it has redrawn. Tests added for each,
  and for when the access token expires on the device's clock (no code change there).
- **Refresh, profile, deletion and start-up of the central session (low-severity review
  items, central login only).** The new token pair of a refresh is written in one queued
  store operation, and only if the refresh token stored at that moment is the one the
  refresh sent; otherwise (another person signed in, or a sign-out or an undone check
  emptied the store) nothing is written. Before, a code check that failed during a refresh
  dropped the new pair, so the next refresh presented a spent token and the service ended
  the session; and a refresh answer arriving after a check for another person had stored its
  session could write the first person's tokens over it (signed in as one person with
  another's tokens), or into an emptied store. A refresh asked for after a code check began
  now waits for the one in flight instead of sending the same token beside it. The profile
  is kept only while the stored session is still that person's. Deleting the account checks
  the stored person in the same queued read that takes the token for the request (and again
  after a refresh, and before it sends again after a 401): if that person is not the one in
  memory, nothing is sent and the deletion fails. (The first version of this check read the
  person in one queued operation and the token in a later one, so a code check for another
  person stored in between could still make the deletion carry that person's token.) A refresh
  that finds the store empty ends the session only while the app says someone is signed in:
  one that waited behind a slow refresh across a sign-out used to begin during the next
  sign-in, find the store empty and cancel that sign-in (the right code answered "failed").
  One failed read of the stored refresh token as a refresh answer arrives no longer signs the
  person out: the new pair is written if nothing has begun since the refresh did, and dropped
  only if something has. A start with some token keys but no whole session and no user used to
  leave those keys behind; it now clears all four. Tests: a state-and-store sweep of 5,000
  fixed random interleavings (and 2,500 that start from broken stored keys) against a stand-in
  service whose refresh tokens work once (it also checks whose token every account deletion
  carried and that the last right code of a run signs in), the refresh and profile cases one
  by one, a failed read of the refresh token, the start-up cases, the deletion mismatch, and
  the central code step's release of its guard after a wrong code.
  Test only: the type errors in the operator-server and central-leave tests are fixed.
- **Whose session a refresh writes, ends and uses (external review of 2026-10-12, R1 and R7,
  central login only).** A refresh of one person could still write that person's new token
  pair over another person's session: when a code check for the second person began before
  the refresh and stored its session while the refresh was out, one failed read of the stored
  refresh token let the pair through (the "nothing has begun" rule of the entry above went by
  the moment a check began, not by what it stored), and an account deletion asked as the
  second person then carried the first person's token. A refresh now notes a session revision
  (moved by every write or removal of the token pair) with its one read and writes its pair
  only if the revision has not moved and the stored refresh token is the one it sent; a failed
  read with the revision unchanged counts as unchanged, so a check that began and failed no
  longer costs the new pair (R35 now keeps it). A refusal of the refresh token ends the
  session only if that token is still the stored one, checked and ended in one queued step: a
  late refusal for the first person no longer signs out the second.
- **A token pair is tied to its person (R1, central login only).** A stored pair belongs to a
  person only when its access token's `sub` names the stored user; the account deletion and
  the facility token (`requestFacilityToken(audience, onlyFor)`, now always for one person)
  are sent only with that person's pair, and a start removes a whole set whose `sub` names
  someone else (a phone already in the state above starts signed out).
- **Sign-out says when the phone kept the session (R3, central login only).** Every failed
  deletion of a secure-store key was ignored, so "Sign out" reported success while the whole
  session stayed stored, and the next start signed the person back in. Each key's deletion is
  now tried twice; `signOutCentral` answers whether all four keys are gone, and My facilities
  shows "Couldn't sign out" with "This phone couldn't remove your association sign-in from its
  secure storage. Restart the app and check that you're signed out before anyone else uses
  this phone." A sign-out marker (`secure_central_signed_out`, a short digest of the refresh
  token being removed, outside the four session keys) is written before the deletion and
  removed once it succeeded; the next start that finds it beside that session removes the
  session again and stays signed out, and the session is not refreshed meanwhile (that last
  rule was found by the fault sweep below: a refresh after the failed deletion replaced the
  pair the marker named). A new sign-in removes an old marker.
- **Opening a facility belongs to the person it began for (R5, central login only).** An open
  begun for one person went on after the central person changed: it switched, asked for a
  token with whoever was stored by then, wrote the first person's list and put the facility
  profile in the store, and the linking step used the number in memory at that moment. The
  open now takes a ticket (the person and an identity generation that moves at every sign-in,
  sign-out or change of person, `src/config/centralState.ts`) and checks it before the switch,
  the token request (asked for that person), the exchange, each list write, the profile and
  the linking code; if the person changed it stops with "sign in again", shows nothing, and
  leaves a facility session the exchange had already started. The profile is now put in the
  store before the list is written; the linking code goes to the number the open began with,
  and a code step begun for another number is not completed. The facility's own SMS sign-in
  checks the same before it switches.
- Tests: the cases R36 to R40 (and R37b, R38b, R38c) in `centralSessionRace.test.ts`, the
  facility-token owner check in `centralSession.test.ts`, O1 to O5 in `openFacility.test.ts`,
  the sign-out message in `centralLeave.test.ts` and `CentralLoginScreens.test.tsx`. The
  sweep of `centralSessionFuzz.test.ts` gained 1,000 seeds with secure-store faults (one read
  that throws, one deletion that throws, or a burst of eight deletions that throw, chosen by a
  generator of their own so the other seeds replay as before) and a check that a sign-out
  that reported success is not followed by a start that signs the person back in. Against the
  code before these fixes it counted REFRESH_TOKEN_PRESENTED_TWICE 1,
  NEXT_START_DISAGREES 1, SIGNED_OUT_WITH_TOKENS_STORED 1 and
  SIGN_OUT_REPORTED_OK_BUT_NEXT_START_SIGNED_IN 1; after them, none. (Its random schedules did
  not reach the narrow R1 interleaving; R36 pins that one.)
- Shared code, no change in behaviour without central login: the server-switch sequence
  moved from `OperatorServerSelection` to `src/store/operatorSwitch.ts`; the part of
  `verifyOTP` that stores a session or an enrollment token is `completeOperatorSignIn`, used
  by both sign-ins; the sign-in and code screens draw with
  `src/components/auth/PhoneSignInForm.tsx` and `CodeEntryForm.tsx`.
- **Also in a build without central login: one check per code on the facility's own code
  screen.** The facility's SMS sign-in (`app/otp.tsx`) arms a 300 ms submit at the sixth
  digit and "Verify code" did not cancel it, so pressing the button within 300 ms of the
  sixth digit started the check twice with the same code (the released app has the same
  fault in its own copy of the timer; this branch had moved it into the shared
  `CodeEntryForm.tsx`, which the linking step also uses). The button now cancels the timer.
  Nothing else on the screen changes: with no button press the sixth digit still starts the
  check 300 ms later, once.
- **Also in a build without central login: a second press of "Verify code" before the
  screen has redrawn starts no second check on the facility's own code screen
  (`app/otp.tsx`).** Two presses in one frame, or a press right after the 300 ms
  auto-submit fired, started two checks with the same code, because the screen had no
  guard of its own and relied on redux state that is redrawn later. It now uses a ref set
  at once and released when the check ends, as the central code step does; the linking step
  (`app/facility-link.tsx`, central login only) the same. A wrong code can still be tried
  again. Nothing else on the screen changes.
- **Sign-out's own refresh follows the one-refresh-at-a-time rule (backlog A20, central login
  only).** With an expired access token, sign-out read the stored pair and then sent its
  refresh token by itself: while a refresh was running it presented the same token a second
  time, and a pair stored between its read and its clear made it present a token already
  replaced. It now reads the pair in the queued step that removes it, waits for a running
  refresh, and uses that refresh's new pair for the revocation instead of sending the token
  again. Test: A20 to A20c in `centralSessionRace.test.ts` (before: two refresh requests with
  the same token).
- **A name the phone cannot store is not reported as saved (backlog A24, central login
  only).** When the secure store failed to write the profile the service answered with, memory
  and store kept the old name while "Save" (and the profile read on My facilities) answered
  success, so the account screen said "Name saved" and showed the new name until the next read. The
  call now answers `unavailable` ("Couldn't save the name" with its message) and nothing changes on the
  phone. Test: A24 to A24c in `centralSessionRace.test.ts`.
- Tests for six parts of the refresh rule that no test held (backlog A23, no change in
  behaviour): A23a (a refresh that wrote its pair after a sign-out began answers
  `session_ended`), A23c (a refresh waiting behind one that throws still runs), A23d (a waiting
  refresh runs under the epoch current when it begins), A23e (a refusal that arrives after a
  code check began ends nothing), A23f (a profile answer is not written over a user key left
  without a session) and A24 (memory takes the new name only after the store did). Each fails
  when its part is taken out of `centralSession.ts`.
- **A late correct code no longer removes a code step that is checking its own code (backlog
  A1, central login only).** After Back during a check and a new code step, the first check
  stores the session and then remembers the terms tick; if the shown code step checked a code
  of its own in that moment, the first check took that step off the stack under its check, or,
  when that code was wrong, the person stayed signed in on the code step with "wrong code". Now
  the first check leaves the shown step alone while that step is checking, and the shown step
  goes on to My facilities after a wrong code too when the person is signed in by then, without
  a message; `autoOpenSpent` is set before the terms wait, so nothing sets My facilities' one
  chance free again after it was spent. Test: "(A1)" in `CentralOpenRemount.test.tsx` (before:
  the wrong-code message over a signed-in person).
- **Also in a build without central login: no "Failed to set initial Realtime auth token"
  warning after a sign-in (backlog A19).** The live order updates (`src/services/order-live-updates.ts`)
  create a Supabase client whose constructor reads the token at once and logs a warning (the
  debug banner) when the read is refused. The read was refused with `SIGN_IN_REQUIRED` when the
  subscription had ended while it was on its way (its screen went, or the session changed),
  which is what was seen about 4 s after a facility sign-in by code on the phone (D20). That
  first read is now left unanswered for an ended subscription (the client is disconnected and
  gets no token; null would give it the public key); a current subscription without a session
  is refused as before. Test: the A19 cases in `order-live-updates.test.ts` (before: the
  warning was logged). Which remount ends the first subscription during the sign-in on the
  phone was not reproduced off the device.
- English and Gujarati text in the new area `central` (and five screen titles in `nav`); the
  Gujarati is a draft for the owner's wording review.
- Still open: passcode and biometrics, SMS auto-read, passkeys, shared devices, removing a
  facility from the list, a header that shows the facility's name inside it.
- Development setup: Metro no longer watches `.claude/` in the checkout. Agents keep git
  worktrees of the app in `.claude/worktrees/`, and Metro's file watcher and resolver could
  see those copies of the source tree. `metro.config.js` now adds a pattern to
  `resolver.blockList` (the defaults stay) that is built from the checkout's own path
  (`scripts/metro-block-list.js`), so a Metro started from inside such a worktree still sees
  that worktree's files. No change to the app.

## Unreleased — price history screen (2026-10-11)

Needs backend migration 48 (`get_item_price_history`), which is in backend
release v0.4.0. Against an older backend the screen shows "Couldn't load the
price history" with "This facility's server needs an update before the price
history is available." (the server's answer that it has no such function,
PGRST202, is recognised in `getItemPriceHistory`); trying again cannot help
until the facility's backend is updated.

- New read-only screen **Price history** (`app/item-price-history.tsx`) for
  administrators and supervisors, opened with the **History** action in the
  header of Item pricing. Staff and customer accounts are not offered the
  action, a link to the route sends them home (`itemPriceHistory` in
  `src/config/roles.ts`, `item-price-history` in
  `src/navigation/routeAccess.ts`), and the server refuses them.
- Newest first, 50 at a time, more on reaching the end of the list, pull to
  refresh. Each entry shows what happened (Price added, Price changed, Price
  deleted, All prices removed), the item, the customer or "Default price", the
  date and time, and who made the change with the role ("Not an app user" for
  a change made with the service key or in the database).
- A changed price lists only the values that differ, old then new; an added
  price lists its values and a deleted price the values it had; "All prices
  removed" says how many. Labels and formats are those of the price form and
  card. A price is shown once, read from `unit_price` (the column billing
  reads) under the label of its own type, "Monthly price" or "One-time price".
  The server's `unit_price_monthly` and `unit_price_one_time` are compatibility
  copies and the one of the other type is never shown as a price or as a
  change. When the price type itself changes, the old price is listed under
  the old type's label and the new price under the new one
  (`src/features/item-pricing/utils/priceHistory.ts`). An entry is shown by
  the values it holds: an update with only its old or only its new values
  lists them as a deleted or an added price does.
- Paging and refresh: a further page that holds only entries already shown
  (50 or more changes written since the page before) is followed by the next
  page at once, up to three in a row, then by a **Load more changes** button;
  a pull to refresh takes the place of a page that is still loading; an
  answer that arrives after the screen was left, or after the account stopped
  being an administrator or supervisor, is dropped without an alert.
- Tests: Jest now runs in the Asia/Kolkata time zone on every machine
  (`jest.global-setup.js`), so a test can write out the date and time a screen
  must show.
- `getItemPriceHistory` in `src/services/item-pricing-service.ts`. English and
  Gujarati text under `pricing.history`; the Gujarati is a draft for the
  owner's wording review.

## Unreleased — the Android artifact CI job can run on a self-hosted runner (2026-10-11)

CI only; the app does not change.

- `Android debug artifact audit` takes `runs-on` from the repository variable
  `ANDROID_ARTIFACT_RUNNER` and falls back to `ubuntu-latest` without it, so a
  fork is unaffected. In this repository the variable names the owner's
  runner machine, which keeps the Gradle caches: the job took 28.5 minutes on
  a hosted runner and 11.5 minutes there (second run in a row). Every other
  job, the two required checks among them, stays on hosted runners.
- `docs/DEVELOPER_HANDOFF.md`, "CI and releases", says what such a runner must
  provide and why it must be an isolated machine. `scripts/workflows.test.mjs`
  refuses a self-hosted label written into a workflow.

## Unreleased — date picker library 0.24, ESLint 10 (2026-10-11)

- `react-native-paper-dates` 0.22.57 to 0.24.0 (visual changes to the calendar
  dialog; the three forms use it as before), `eslint` and `@eslint/js` 9 to 10.
  Carries the Dependabot commit of pull request 25.
- ESLint 10 reports two new kinds of error. An unused first assignment was
  removed in `OrderItemCard.tsx` and in one test. The three "Failed to read
  image file" errors keep no `cause` on purpose (the caught error can name a
  local file path and is already logged); the rule is switched off on those
  three lines with that reason. No behaviour change. No backend change.

## Unreleased — hint under a typed invoice number (2026-10-11)

- New invoice, step 1: under a number the user typed over the suggestion the
  hint said "The next number is filled in. You can change it." It now says
  "You typed this number. Clear the field to get the next number." After a
  lookup that failed the hint still asks for a typed number. Under a field the
  user has emptied there is no hint until the field is left and the next
  number arrives (it said "The next number is filled in" under an empty field).
  `src/tests/components/InvoiceNumberHint.test.tsx`. No backend change.

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
  is never replaced.
- While the number is being asked for (a new form, or after the date moved to
  another year) the field is empty with a spinner, the hint reads "Getting the
  next invoice number…" and "Next" waits. The suggestion of the year before
  leaves the field at once; it used to stay there, editable, until the answer
  came, and could be saved as a number of the new year. The field can still be
  typed in: a typed number is kept and ends the wait.
- An emptied field gets the suggestion of the form's financial year again when
  the field is left, or when "Next" is pressed with the field empty (the
  number is asked for first, instead of a message about a missing number).
  Nothing is put into the field while the user is in it: an answer arriving
  between two key presses would be typed into. After a lookup that failed the
  form does not ask again by itself; it asks for a typed number.
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
  still refused, in a new invoice and in an edit, with a message that speaks
  of the duration only: "1 item has a duration of 0. The duration must be
  greater than 0."
- Edit, items step: every other failure of the items check is reported in its
  own words ("Duration must be at least 0.5 months", "Days cannot be
  negative", "Tax cannot exceed 100%", ...), each once, as the new-invoice
  form does. The edit form used to answer all of them with one fixed sentence
  about the duration, which named a rule the line already met. That sentence
  (`invoice.items.checkPricesMessage`) is removed.
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
- "A charge of 0" is decided after rounding the charge to two decimals, as the
  server decides it: the reason field, the staff rule, the `zero_charge_reason`
  key, the line in the save question and the total of 0 all use the one test
  (`isZeroChargeLine`). A charge the money fields cannot produce, such as
  0.004, counts as 0 on both sides; 0.005 is 0.01 on both sides.
- New invoice: the reason belongs to the GRN it was written for. When another
  GRN is chosen in the same form the reason field starts empty again (it used
  to keep the text, which then met the staff rule for the new GRN's free lines
  with a reason about other goods). Choosing the same GRN again keeps it; so
  does an invoice that is being edited.
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

Found by the device check of these changes (2026-10-11)
- A dialog that only informs ("Enter a discount reason", "Enter a reason for the
  zero charge", "Check the discount" and the like) showed an empty outlined
  button beside "Close". `ConfirmDialog` drew its cancel button even when the
  screen passed an empty cancel text. It now shows one button.

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
