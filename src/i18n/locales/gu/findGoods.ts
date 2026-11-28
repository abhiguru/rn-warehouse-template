/** Gujarati text: findGoods. Follows docs/GUJARATI_GLOSSARY.md. */
import type { findGoods as source } from '@/i18n/locales/en/findGoods';
import type { Translation } from '@/i18n/types';

export const findGoods: Translation<typeof source> = {
  searchPlaceholder: 'માર્કો, રેક, આઇટમ, વેપારી કે આવક પાવતી',
  introTitle: 'માલ શોધો',
  introText: 'માર્કો, રેક, આઇટમ, વેપારી કે આવક પાવતી નંબરનો કોઈ પણ ભાગ લખો.',
  noRack: 'રેક નથી',
  noMatchTitle: '"{{text}}" સાથે કોઈ જથ્થો મળતો નથી',
  noMatchText: 'જેનો સ્ટોક પૂરો થયો છે તે જથ્થા પણ શોધમાં છે, એટલે કોલ્ડ સ્ટોરેજમાં આ લખાણ ક્યાંય નથી.',
  rowHint: 'આવક પાવતી ખોલે છે',
  copyReadFailed: 'આ ફોનની માહિતી વાંચી શકાઈ નથી',
  copyReadFailedHint: 'ફરી પ્રયાસ કરો. વારંવાર થાય તો ઍપ બંધ કરીને ફરી ખોલો.',
  lessNotSent: 'મોકલવાની બાકી જાવકના {{count}} નંગ બાદ',
  lessHeld: 'રોકેલી જાવકના {{count}} નંગ બાદ',
};
