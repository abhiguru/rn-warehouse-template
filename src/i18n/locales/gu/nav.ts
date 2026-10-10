/** Gujarati text: nav. Follows docs/GUJARATI_GLOSSARY.md. */
import type { nav as source } from '../en/nav';
import type { Translation } from '../../types';

export const nav: Translation<typeof source> = {
  loading: 'લોડ થઈ રહ્યું છે',
  // The five tab labels are the owner's choice (glossary, "Bottom tabs").
  tabs: {
    orders: 'ઑર્ડર',
    grn: 'આવક',
    dispatch: 'જાવક',
    invoices: 'બિલ',
    reports: 'અહેવાલ',
  },
  ordersView: {
    orders: 'ઑર્ડર',
    queue: 'કતાર',
  },
  screens: {
    signIn: 'સાઇન ઇન કરો',
    enterCode: 'OTP લખો',
    waitingForApproval: 'મંજૂરીની રાહ જોવાય છે',
    facility: 'કોલ્ડ સ્ટોરેજ',
    enrollmentReview: 'નોંધણીની ચકાસણી',
    editGrn: 'આવક પાવતીમાં ફેરફાર કરો',
  },
  bootstrap: {
    unreachable: 'કોલ્ડ સ્ટોરેજના સર્વર સુધી પહોંચી શકાયું નથી. તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.',
    connectFailed: 'કોલ્ડ સ્ટોરેજના સર્વર સાથે જોડાઈ શકાયું નથી. ફરી પ્રયાસ કરો, અથવા બીજું સર્વર પસંદ કરો.',
    verifyFailed: 'પસંદ કરેલા સર્વરની ચકાસણી થઈ શકી નથી. ફરી પ્રયાસ કરો, અથવા બીજું સર્વર પસંદ કરો.',
  },
  reports: {
    title: 'અહેવાલ',
    subtitleStaff: 'કામગીરી અને વેપારીના અહેવાલ જુઓ',
    subtitleCustomer: 'તમારા સ્ટોકના અહેવાલ જુઓ',
    profileAndSettings: 'પ્રોફાઇલ અને સેટિંગ',
    inventorySection: 'સ્ટોકના અહેવાલ',
    operationsSection: 'કામગીરીના અહેવાલ',
    cardLabel: '{{title}}. {{description}}',
    descriptions: {
      customerActivity: 'વેપારીની બધી કામગીરી એક જગ્યાએ જુઓ',
      stockSummary: 'હાલનો સ્ટોક એક નજરે જુઓ',
      itemStockSummary: 'બધા વેપારીનો મળીને દરેક આઇટમનો સ્ટોક જુઓ',
      dispatchActivity: 'તાજેતરની જાવક અને બહાર ગયેલો માલ',
      grnActivity: 'તાજેતરમાં આવેલો માલ અને તેના ઇન્વૉઇસની સ્થિતિ',
      invoiceHistory: 'બિલિંગનો ઇતિહાસ અને ચુકવણીની સ્થિતિ',
      stockAging: 'માલ કેટલા સમયથી રાખેલો છે તે જુઓ',
      operationsDashboard: 'રોજના આંકડા અને કામગીરીની ઝલક',
    },
  },
};
