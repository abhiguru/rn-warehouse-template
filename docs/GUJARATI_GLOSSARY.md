# Gujarati glossary

The words the app uses in Gujarati. Every Gujarati text in `src/i18n/locales/gu` follows
this list, so one thing has one name on every screen. Change a word here first, then in the
text files.

- **Owner's choice** rows were decided by the owner on 2026-10-10.
- **Checked** rows were confirmed against real Gujarati usage on the web (Android and Chrome
  Gujarati text, the Gujarati GST guide and e-invoice portal, Gujarati news on cold storages
  and market yards). The evidence and its limits are in the project notes
  (`gujarati-glossary-web-check.md`).
- **Draft** rows are neither; they need a second look from someone in the trade.

Treatment: **translate** = a Gujarati word; **Gujarati letters** = the English word written
in Gujarati script; **English** = left in English letters.

## Rules

1. **Typed data is never translated**: customer, item and package names, notes.
2. **Digits**: in Gujarati mode counts, weights, amounts, dates and times use ૦-૯.
   Identifiers stay as typed in 0-9: receipt, dispatch and invoice numbers, vehicle, GST,
   PAN, phone numbers, login codes.
3. **A noun does not change after a number**: ૧ બોરી, ૫ બોરી; ૧ આઇટમ, ૩ આઇટમ.
4. **Whole sentences**: "…થી … સુધી" follows its values, so a date or number range uses
   noun labels (શરૂઆતની તારીખ, છેલ્લી તારીખ), never "From:" and "To:" word for word.
5. **Spelling**: ઑ in ઑર્ડર, ઑગસ્ટ, ઑક્ટોબર; પહેલાં with its dot; plural વિગતો, પરિણામો.
6. **Kept in English letters**: GRN (where the code itself is meant), GST, PAN, OTP, kg in
   narrow columns.

## Trade words

| English | Gujarati | Treatment | Basis |
|---|---|---|---|
| Goods received note (GRN) | આવક પાવતી | translate | Owner's choice |
| Receipt of goods, inward | આવક | translate | Checked |
| Dispatch, outward | જાવક | translate | Owner's choice |
| Invoice | ઇન્વૉઇસ | Gujarati letters | Owner's choice |
| Order | ઑર્ડર | Gujarati letters | Checked |
| Order queue | ઑર્ડરની કતાર | translate | Checked |
| Customer | વેપારી | translate | Owner's choice |
| Sender | મોકલનાર | translate | Checked |
| Supervisor | સુપરવાઇઝર | Gujarati letters | Draft |
| Staff | સ્ટાફ | Gujarati letters | Draft |
| Admin | એડમિન | Gujarati letters | Checked |
| Owner | માલિક | translate | Checked |
| Item (a commodity line) | આઇટમ | Gujarati letters | Owner's choice |
| Goods (not counted) | માલ | translate | Checked |
| Stock | સ્ટોક | Gujarati letters | Owner's choice |
| In stock | સ્ટોકમાં છે | translate | Owner's choice |
| Low stock | ઓછો સ્ટોક | translate | Owner's choice |
| Out of stock | સ્ટોક નથી | translate | Owner's choice |
| Bag, bags | બોરી | translate | Owner's choice |
| Package mark | માર્કો | translate | Owner's choice |
| Packaging | પેકિંગ | Gujarati letters | Draft |
| Chamber | ચેમ્બર | Gujarati letters | Owner's choice |
| Rack | રેક | Gujarati letters | Owner's choice |
| Weight | વજન | translate | Checked |
| kg | કિલો (kg in narrow columns) | translate | Checked |
| Quantity (a count of bags) | નંગ | translate | Checked |
| Quantity (a general amount) | જથ્થો | translate | Checked |
| Vehicle number | વાહન નંબર | translate | Checked |
| Driver | ડ્રાઇવર | Gujarati letters | Checked |
| Rent, storage charge | ભાડું | translate | Checked |
| Rate of a charge | દર | translate | Checked |
| Price of goods | ભાવ | translate | Checked |
| Monthly | માસિક | translate | Checked |
| One-time | એક વખત | translate | Checked |
| Labour (loading and unloading) | મજૂરી | translate | Owner's choice |
| Discount | ડિસ્કાઉન્ટ | Gujarati letters | Checked |
| Discount reason | ડિસ્કાઉન્ટનું કારણ | translate | Checked |
| Tax | ટેક્સ | Gujarati letters | Owner's choice |
| GST | GST | English | Checked |
| Total | કુલ | translate | Checked |
| Net before tax | ટેક્સ પહેલાંની રકમ | translate | Checked |
| Amount | રકમ | translate | Checked |
| Financial year | નાણાકીય વર્ષ | translate | Checked |
| Date | તારીખ | translate | Checked |
| Start date, end date (a range) | શરૂઆતની તારીખ, છેલ્લી તારીખ | translate | Checked |
| Notes, remarks | નોંધ | translate | Checked |
| Print (button) | પ્રિન્ટ કરો | Gujarati letters | Checked |
| Report | અહેવાલ | translate | Owner's choice |
| Stock summary | સ્ટોકનો સારાંશ | translate | Checked |
| Stock aging | માલ કેટલા દિવસથી પડ્યો છે | translate | Owner's choice |
| Facility (one cold storage) | કોલ્ડ સ્ટોરેજ | Gujarati letters | Owner's choice |
| Warehouse, godown | વખાર | translate | Owner's choice |
| Photo | ફોટો | Gujarati letters | Checked |
| Order status: open | બાકી | translate | Owner's choice |
| Order status: closed | પૂર્ણ | translate | Owner's choice |
| Fully dispatched | બધો માલ ગયો | translate | Owner's choice |
| Partly dispatched | થોડો માલ ગયો | translate | Owner's choice |

## Bottom tabs

| English | Gujarati | Basis |
|---|---|---|
| Orders | ઑર્ડર | Owner's choice |
| GRN | આવક | Owner's choice |
| Dispatch | જાવક | Owner's choice |
| Invoices | બિલ (the tab only; ઇન્વૉઇસ everywhere else) | Owner's choice |
| Reports | અહેવાલ | Owner's choice |

## Interface words

| English | Gujarati | Treatment | Basis |
|---|---|---|---|
| Search | શોધો | translate | Checked |
| Filter, Filters | ફિલ્ટર | Gujarati letters | Checked |
| Sort | સૉર્ટ કરો | Gujarati letters | Checked |
| Sort by | આ મુજબ સૉર્ટ કરો | Gujarati letters | Checked |
| Newest first, Oldest first | સૌથી નવા પહેલાં, સૌથી જૂના પહેલાં | translate | Checked |
| Highest number first, Lowest number first | નંબર: ઉતરતા ક્રમમાં, નંબર: ચઢતા ક્રમમાં | translate | Checked |
| Clear all | બધું સાફ કરો | translate | Checked |
| Reset | રીસેટ કરો | Gujarati letters | Checked |
| Apply | લાગુ કરો | translate | Checked |
| Show results | પરિણામો બતાવો | translate | Checked |
| Show N items | N આઇટમ બતાવો | translate | Checked |
| No results | કોઈ પરિણામ મળ્યું નથી | translate | Checked |
| Tap for item details | આઇટમની વિગતો માટે ટૅપ કરો | translate | Checked |
| Hide item details | વિગતો છુપાવો | translate | Checked |
| Save | સાચવો | translate | Checked |
| Cancel | રદ કરો | translate | Checked |
| Delete | ડિલીટ કરો | Gujarati letters | Checked |
| Edit | ફેરફાર કરો | translate | Checked |
| Add | ઉમેરો | translate | Checked |
| Create | બનાવો | translate | Checked |
| Done | થઈ ગયું | translate | Checked |
| Back | પાછળ | translate | Checked |
| Next, Previous | આગળ, પાછલું | translate | Checked |
| Submit | સબમિટ કરો | Gujarati letters | Checked |
| Confirm | કન્ફર્મ કરો | Gujarati letters | Checked |
| Settings | સેટિંગ | Gujarati letters | Checked |
| Profile | પ્રોફાઇલ | Gujarati letters | Checked |
| Language | ભાષા | translate | Checked |
| Sign in, Sign out | સાઇન ઇન કરો, સાઇન આઉટ કરો | Gujarati letters | Checked |
| Mobile number | મોબાઇલ નંબર | Gujarati letters | Checked |
| Login code | OTP | English | Checked |
| Refresh | રિફ્રેશ કરો | Gujarati letters | Checked |
| Loading… | લોડ થઈ રહ્યું છે… | translate | Checked |
| Try again | ફરી પ્રયાસ કરો | translate | Checked |
| Required | જરૂરી | translate | Checked |
| Today, Yesterday | આજે, ગઈકાલે | translate | Checked |
| Last 7 days | છેલ્લા ૭ દિવસ | translate | Checked |
| This month, Last month | આ મહિને, ગયા મહિને | translate | Checked |
| All | બધા (agrees with its noun) | translate | Checked |
| Active, Inactive | સક્રિય, નિષ્ક્રિય | translate | Checked |
| Pending | બાકી | translate | Checked |
| Dark mode, Light mode | ડાર્ક મોડ, લાઇટ મોડ | Gujarati letters | Checked |

## Months and weekdays

From the Unicode locale data that Android uses.

| | Short | Full |
|---|---|---|
| Months | જાન્યુ, ફેબ્રુ, માર્ચ, એપ્રિલ, મે, જૂન, જુલાઈ, ઑગસ્ટ, સપ્ટે, ઑક્ટો, નવે, ડિસે | જાન્યુઆરી, ફેબ્રુઆરી, માર્ચ, એપ્રિલ, મે, જૂન, જુલાઈ, ઑગસ્ટ, સપ્ટેમ્બર, ઑક્ટોબર, નવેમ્બર, ડિસેમ્બર |
| Weekdays (Sunday first) | રવિ, સોમ, મંગળ, બુધ, ગુરુ, શુક્ર, શનિ | રવિવાર, સોમવાર, મંગળવાર, બુધવાર, ગુરુવાર, શુક્રવાર, શનિવાર |
| Time of day | AM, PM | સવારે, બપોરે, સાંજે, રાત્રે where a sentence needs a word |

## Open points

- સુપરવાઇઝર, સ્ટાફ and પેકિંગ are drafts with no source found.
- Whether "૧ બોરી" reads naturally with the number one was not seen in a source.
- The web check found Gujarati business text mostly writes amounts in 0-9. The owner chose
  ૦-૯; the receipt-list pilot is where that choice is looked at again on a real screen.
