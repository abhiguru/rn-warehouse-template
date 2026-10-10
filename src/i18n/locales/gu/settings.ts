/** Gujarati text: settings. Follows docs/GUJARATI_GLOSSARY.md. */
import type { settings as source } from '../en/settings';
import type { Translation } from '../../types';

export const settings: Translation<typeof source> = {
  title: 'સેટિંગ',
  profileHint: 'તમારી પ્રોફાઇલ ખોલે છે',
  features: {
    title: 'ઍપની સુવિધાઓ',
    customersSubtitle: 'વેપારીઓનાં એકાઉન્ટ સંભાળો',
    enrollmentReviewSubtitle: 'વેપારીઓને મંજૂર કરો, ઍક્સેસ આપો',
    itemsSubtitle: 'સ્ટોકની આઇટમ સંભાળો',
    usersSubtitle: 'વપરાશકર્તાઓનાં એકાઉન્ટ સંભાળો',
    itemPricing: 'આઇટમના દર',
    itemPricingSubtitle: 'દર જુઓ અને બદલો',
    sensors: 'તાપમાન અને ભેજ',
    sensorsSubtitle: 'લોકલ ડેમોમાં ઉપલબ્ધ નથી',
  },
  appearance: {
    title: 'દેખાવ',
    system: 'ફોન મુજબ',
    light: 'લાઇટ',
    dark: 'ડાર્ક',
    footerSystemDark: 'તમારા ફોનના સેટિંગ મુજબ. હાલ ડાર્ક મોડ ચાલુ છે.',
    footerSystemLight: 'તમારા ફોનના સેટિંગ મુજબ. હાલ લાઇટ મોડ ચાલુ છે.',
    footerDark: 'ડાર્ક મોડ હંમેશાં ચાલુ છે.',
    footerLight: 'લાઇટ મોડ હંમેશાં ચાલુ છે.',
  },
  language: {
    title: 'ભાષા',
    system: 'ફોનની ભાષા',
    footerSystem: 'તમારા ફોનની ભાષા મુજબ. ઍપ હાલ ગુજરાતીમાં છે.',
    footerChosen: 'ઍપ ગુજરાતીમાં છે.',
    optionLabel: '{{language}} ભાષા',
  },
  brand: {
    title: 'બ્રાન્ડ',
    footer: 'આખી ઍપના રંગ. લાઇટ અને ડાર્ક બંને મોડમાં ચાલે છે.',
    optionLabel: '{{brand}} બ્રાન્ડ',
    orange: 'નારંગી',
    gcsa: 'GCSA નેવી',
  },
  account: {
    title: 'એકાઉન્ટ',
    deleteAccount: 'એકાઉન્ટ ડિલીટ કરો',
    deleteAccountSubtitle: 'એકાઉન્ટ અને ડેટા કાયમી ડિલીટ કરો',
  },
  about: {
    title: 'ઍપ વિશે',
    terms: 'સેવાની શરતો',
    termsSubtitle: 'નિયમો અને શરતો જુઓ',
    privacy: 'ગોપનીયતા નીતિ',
    privacySubtitle: 'અમે તમારા ડેટાનું શું કરીએ છીએ',
  },
  development: {
    title: 'ડેવલપમેન્ટ',
    styleGuide: 'સ્ટાઇલ ગાઇડ',
    styleGuideSubtitle: 'બ્રાન્ડ અને મોડનાં ટોકન, કમ્પોનન્ટ',
  },
  footer: {
    version: 'મેનેજમેન્ટ સિસ્ટમ v{{version}}',
  },
  deleteAccount: {
    warningTitle: 'તમારું એકાઉન્ટ ડિલીટ કરવું છે?',
    warningMessage:
      'આ પાછું લાવી શકાશે નહીં. આ બધું ડિલીટ થશે:\n• તમારી પ્રોફાઇલની માહિતી\n• સોંપેલા વેપારી\n• ઍપની પસંદગીઓ અને કૅશ\n\nઆવક પાવતી અને જાવક જેવા રેકોર્ડ નિયમ મુજબ રાખવામાં આવે છે.',
    confirmTitle: 'ડિલીટ કરવાનું કન્ફર્મ કરો',
    confirmMessage: 'એકાઉન્ટ ડિલીટ કરવા માટે તમારા એકાઉન્ટનો મોબાઇલ નંબર નાખો.',
    phonePlaceholder: '૧૦ આંકડાનો મોબાઇલ નંબર',
    mismatch: 'આ નંબર તમારા એકાઉન્ટ સાથે મળતો નથી. તપાસીને ફરી પ્રયાસ કરો.',
    failed: 'તમારું એકાઉન્ટ ડિલીટ કરી શકાયું નથી. તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.',
  },
};
