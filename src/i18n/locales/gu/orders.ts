/** Gujarati text: orders. Follows docs/GUJARATI_GLOSSARY.md. */
import type { orders as source } from '../en/orders';
import type { Translation } from '../../types';

export const orders: Translation<typeof source> = {
  // The order screen of one customer.
  screen: {
    title: 'ઑર્ડર: {{name}}',
    viewHistory: 'ઑર્ડરનો ઇતિહાસ જુઓ',
    addItemsToOrder: 'ઑર્ડરમાં આઇટમ ઉમેરો',
    historyError: 'ઑર્ડરનો ઇતિહાસ લોડ કરી શકાયો નથી. તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.',
  },
  manage: {
    loading: 'ઑર્ડર લોડ થઈ રહ્યો છે…',
    loadingLabel: 'ઑર્ડર લોડ થઈ રહ્યો છે',
    couldNotOpenTitle: 'ઑર્ડર ખોલી શકાયો નથી',
    businessInactive: 'આ વેપારી હવે સક્રિય નથી. તમારા કોલ્ડ સ્ટોરેજને પૂછો.',
    businessDeactivatedStaff: 'આ વેપારી નિષ્ક્રિય છે. ઑર્ડર લેવા માટે વેપારીઓમાં તેને ચાલુ કરો.',
    deactivatedTitle: 'કોલ્ડ સ્ટોરેજમાં નિષ્ક્રિય',
    deactivatedCustomer: 'તમે હજુ પણ તમારો માલ ઑર્ડર કરીને બહાર લઈ જઈ શકો છો.',
    deactivatedStaff: 'નવો માલ લેવાતો નથી. બદલવા માટે વેપારીઓમાં તેને ચાલુ કરો.',
    couldNotLoadTitle: 'ઑર્ડર લોડ કરી શકાયો નથી',
    couldNotChangeQuantityTitle: 'નંગ બદલી શકાયા નથી',
    removeTitle: '{{name}} કાઢી નાખવી છે?',
    removeMessage: '{{name}} આ ઑર્ડરમાંથી નીકળી જશે.',
    removeTitleNoName: 'આ આઇટમ કાઢી નાખવી છે?',
    removeMessageNoName: 'આ આઇટમ આ ઑર્ડરમાંથી નીકળી જશે.',
    removeItem: 'આઇટમ કાઢી નાખો',
    couldNotRemoveTitle: 'આઇટમ કાઢી શકાઈ નથી',
    // Draft for the owner's wording review (2026-10-20): a line that is no longer on the order when it is changed or removed.
    lineGoneTitle: 'આ આઇટમ હવે ઑર્ડરમાં નથી',
    lineGoneMessage: 'બીજા કોઈએ તેને કાઢી નાખી છે અથવા તેની જાવક થઈ ગઈ છે. ઑર્ડર હવે જેવો છે તેવો ફરી બતાવ્યો છે.',
    // Drafts for the owner's wording review (2026-10-20): the answer to a change of a line was lost; the server did not apply it.
    lostAnswerNotSaved: 'સર્વરે ફેરફાર સાચવ્યો નથી. ઑર્ડરમાં હવે જે સચવાયેલું છે તે દેખાય છે.',
    lostAnswerNotRemoved: 'સર્વરે આઇટમ કાઢી નાખી નથી. તે હજુ ઑર્ડરમાં છે.',
    emptyTitle: 'આ ઑર્ડરમાં કોઈ આઇટમ નથી',
    emptyMessage: 'આ વેપારીના સ્ટોકમાંથી તમે ઉમેરેલી આઇટમ અહીં દેખાશે.',
    labelDetail: '{{label}}, {{detail}}',
  },
  // One line of the order, with its quantity stepper.
  item: {
    saved: 'સચવાયું',
    qty: 'નંગ',
    noMark: 'માર્કો નથી',
    addAmount: '{{name}} માં {{amount}} ઉમેરો',
    removeAmount: '{{name}} માંથી {{amount}} ઘટાડો',
    increase: '{{name}} માં {{amount}} વધારો',
    decrease: '{{name}} માંથી {{amount}} ઘટાડો',
    removeFromOrder: '{{name}} ને ઑર્ડરમાંથી કાઢી નાખો',
    quantity: 'નંગ {{quantity}}',
    quantitySaving: 'નંગ {{quantity}}, સાચવી રહ્યા છીએ',
    quantitySaved: 'નંગ {{quantity}}, સચવાયું',
    // Draft for the owner's wording review (2026-10-20): the line asks for more than the lot has now.
    onlyInStock: 'સ્ટોકમાં ફક્ત {{stock}} છે',
  },
  // Drafts for the owner's wording review (2026-10-20): someone else changed the line after this screen read it; nothing was saved.
  refusal: {
    staleTitle: 'બીજા કોઈએ ઑર્ડરની આ આઇટમ બદલી છે',
    stale: 'હવે તેમાં {{current}} દેખાય છે. તમે {{chosen}} ઇચ્છતા હતા. હજુ એ જોઈતું હોય તો ફરી બદલો.',
    staleRemove: 'બીજા કોઈએ ઑર્ડરની આ આઇટમ બદલી છે, તેથી તે કાઢી નથી. તપાસીને ફરી પ્રયાસ કરો.',
  },
  quickAdd: {
    select: '{{name}} પસંદ કરો',
    loadingRecent: 'તાજેતરની આઇટમ લોડ થઈ રહી છે',
  },
  // The sheet for choosing stock items and their quantities.
  catalog: {
    addItems: 'આઇટમ ઉમેરો',
    cancelAdding: 'આઇટમ ઉમેરવાનું રદ કરો',
    addCountToOrder: 'ઑર્ડરમાં {{items}} ઉમેરો',
    addCount: 'ઉમેરો ({{count}})',
    couldNotLoadTitle: 'આઇટમ લોડ કરી શકાઈ નથી',
    noneSelectedTitle: 'કોઈ આઇટમ પસંદ કરી નથી',
    noneSelectedMessage: 'ઓછામાં ઓછી એક આઇટમના નંગ પસંદ કરો, પછી ઉમેરો પર ટૅપ કરો.',
    searchLabel: 'સ્ટોકની આઇટમ શોધો',
    searchPlaceholderHint: 'નામ, માર્કો કે વજનથી શોધો',
    searchItems: 'આઇટમ શોધો',
    resultsByWeight: 'વજન મુજબ {{total}} માંથી {{shown}}',
    resultsByName: 'નામ કે પેકિંગ મુજબ {{total}} માંથી {{shown}}',
    rowMark: 'માર્કો {{mark}}',
    grn: 'આવક પાવતી {{number}}',
    rowStock: '{{status}}, {{total}} માંથી {{current}}',
    rowAlreadyInOrder: 'ઑર્ડરમાં પહેલેથી છે',
    rowSelected: '{{bags}} પસંદ કરી',
    inOrder: 'ઑર્ડરમાં છે',
    ofTotal: 'કુલ {{total}}',
    addBags: { one: '{{name}} ના {{count}} નંગ ઉમેરો', other: '{{name}} ના {{count}} નંગ ઉમેરો' },
    removeBags: { one: '{{name}} ના {{count}} નંગ ઘટાડો', other: '{{name}} ના {{count}} નંગ ઘટાડો' },
    selectedOf: '{{name}} ની {{bags}} પસંદ કરી',
    noStockForTitle: '"{{search}}" માટે કોઈ સ્ટોક નથી',
    noStockForMessage: 'ઓછા અક્ષરો, બીજો માર્કો અથવા ૧૦-૨૦ જેવી વજનની મર્યાદા લખી જુઓ.',
    emptyTitle: 'સ્ટોકમાં કોઈ આઇટમ નથી',
    emptyMessage: 'આ વેપારીની આવક પાવતીની આઇટમ સ્ટોક હોય ત્યાં સુધી અહીં દેખાશે.',
    loadingMore: 'વધુ આઇટમ લોડ થઈ રહી છે…',
    catalogName: 'કેટલોગ {{name}}',
    allCatalogs: 'બધા કેટલોગ',
    // Leaving with selections that were not added.
    discardTitle: 'પસંદગી છોડી દેવી છે?',
    discardMessage: {
      one: '{{count}} જથ્થાના ફેરફાર સચવાયા નથી.',
      other: '{{count}} જથ્થાના ફેરફાર સચવાયા નથી.',
    },
    discardSelections: 'પસંદગી છોડી દો',
    // The same question when Add would send something: it lists the changes and offers Add to order. Gujarati is a draft.
    addChangesTitle: 'આ ફેરફાર ઑર્ડરમાં ઉમેરવા છે?',
    addToOrder: 'ઑર્ડરમાં ઉમેરો',
    // One line per changed lot; {{lot}} is "name · mark · GRN · weight", {{count}} the bags after the change.
    // The changed quantity is in words, not "→", so a screen reader says it right.
    changeAdd: { one: '{{lot}} — {{count}} નંગ ઉમેરો', other: '{{lot}} — {{count}} નંગ ઉમેરો' },
    changeSet: { one: '{{lot}} — {{from}} થી {{count}} નંગ', other: '{{lot}} — {{from}} થી {{count}} નંગ' },
    // {{count}} is the bags on the order that would be taken off.
    changeRemove: { one: '{{lot}} — {{count}} નંગ દૂર કરો', other: '{{lot}} — {{count}} નંગ દૂર કરો' },
    // Last line of the question when Add is not offered (every lot already on the order was taken off, none chosen). Draft.
    discardOnlyNote: 'પસંદગી છોડી દેવાથી ઑર્ડર જેમ છે તેમ રહે છે. બધા જથ્થા કાઢવા માટે ઑર્ડરના પેજ પરથી આઇટમ કાઢી નાખો.',
    // Add waits for the server; a lot that was not saved keeps its reason.
    savingProgress: '{{total}} માંથી {{done}} સાચવી રહ્યા છીએ…',
    // Shown only when at least one lot was not saved, so `one` (0 and 1 in Gujarati) is written for 1.
    notSavedSummary: {
      one: '{{count}} જથ્થો સચવાયો નથી. તેના પર કારણ જુઓ.',
      other: '{{count}} જથ્થા સચવાયા નથી. દરેક પર કારણ જુઓ.',
    },
    reasonStock: 'સ્ટોકમાં ફક્ત {{bags}} છે.',
    reasonAlreadyInOrder: 'આ જથ્થો ઑર્ડરમાં પહેલેથી છે.',
    reasonBelowDispatched: '{{bags}} ની જાવક થઈ ચૂકી છે. એટલા કે વધુ નંગ પસંદ કરો.',
    reasonOrderClosed: 'આ ઑર્ડર પૂર્ણ થયો છે. પાછા જઈને ફરી ખોલો.',
    reasonNotSaved: 'સચવાયું નથી. તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.',
    // Draft for the owner's wording review (2026-10-20): a line that is no longer on the order.
    reasonLineGone: 'આ આઇટમ હવે ઑર્ડરમાં નથી.',
    // Someone else changed the lot while the picker was open; nothing was overwritten.
    reasonChangedMeanwhile: 'બીજા કોઈએ ફેરફાર કર્યો: હવે ઑર્ડરમાં {{bags}} છે. {{chosen}} કરવા માટે ફરી "ઉમેરો" દબાવો.',
    reasonRemovedMeanwhile: 'બીજા કોઈએ આ જથ્થો દૂર કર્યો. {{chosen}} ઉમેરવા માટે ફરી "ઉમેરો" દબાવો.',
    reasonChangedMeanwhileRemove: 'બીજા કોઈએ ફેરફાર કર્યો: હવે ઑર્ડરમાં {{bags}} છે. દૂર કરવા માટે ફરી "ઉમેરો" દબાવો.',
    // Drafts for the owner's wording review (2026-10-20): the answer was lost, the lot was checked, the server did not apply it.
    reasonCheckedNotSaved: 'તપાસ્યું: સચવાયું નથી. {{chosen}} ઉમેરવા માટે ફરી "ઉમેરો" દબાવો.',
    reasonCheckedOther: 'તપાસ્યું: ઑર્ડરમાં હવે {{bags}} છે. {{chosen}} કરવા માટે ફરી "ઉમેરો" દબાવો.',
    reasonCheckedNotRemoved: 'તપાસ્યું: દૂર થયું નથી. દૂર કરવા માટે ફરી "ઉમેરો" દબાવો.',
    reasonLineChecking: 'આ આઇટમ હજુ તપાસાઈ રહી છે. થોડી વાર પછી ફરી "ઉમેરો" દબાવો.',
    leaveCheckingTitle: 'તપાસ દરમિયાન છોડી દેવું છે?',
    keepWaiting: 'રાહ જુઓ',
    leaveAnyway: 'છતાં છોડી દો',
  },
};
