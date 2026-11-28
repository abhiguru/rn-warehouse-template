/**
 * WH-161: the texts for a GRN with no number yet have an English and a Gujarati text, and the Gujarati keeps the same
 * placeholders as its numbered twin (or none, as the pending text names no number).
 */
import { grn as grnEn } from '@/i18n/locales/en/grn';
import { grn as grnGu } from '@/i18n/locales/gu/grn';
import { offline as offlineEn } from '@/i18n/locales/en/offline';
import { offline as offlineGu } from '@/i18n/locales/gu/offline';

const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();

describe('texts for a GRN with no number yet, English and Gujarati', () => {
  const pairs: Array<[string, string, string]> = [
    ['confirmCreateTitlePending', grnEn.review.confirmCreateTitlePending, (grnGu.review?.confirmCreateTitlePending ?? '')],
    ['savedAfterLeavingPending', grnEn.review.savedAfterLeavingPending, (grnGu.review?.savedAfterLeavingPending ?? '')],
    ['savedAfterLeavingPhotosPending', grnEn.review.savedAfterLeavingPhotosPending, (grnGu.review?.savedAfterLeavingPhotosPending ?? '')],
    ['offlineNew.heroNumberPending', offlineEn.offlineNew.heroNumberPending, (offlineGu.offlineNew?.heroNumberPending ?? '')],
  ];

  it.each(pairs)('%s has a text in both languages, and the Gujarati is not the English', (_key, en, gu) => {
    expect(en.trim()).not.toBe('');
    expect(gu.trim()).not.toBe('');
    expect(gu).not.toBe(en);
    expect(/[઀-૿]/.test(gu)).toBe(true);
  });

  it.each(pairs)('%s names no number in either language', (_key, en, gu) => {
    expect(placeholders(en)).toEqual([]);
    expect(placeholders(gu)).toEqual([]);
  });

  it('the numbered twins keep {{number}} in both languages', () => {
    expect(placeholders(grnEn.review.confirmCreateTitle)).toEqual(['{{number}}']);
    expect(placeholders((grnGu.review?.confirmCreateTitle ?? ''))).toEqual(['{{number}}']);
    expect(placeholders(grnEn.review.savedAfterLeaving)).toEqual(['{{number}}']);
    expect(placeholders((grnGu.review?.savedAfterLeaving ?? ''))).toEqual(['{{number}}']);
    expect(placeholders(grnEn.review.savedAfterLeavingPhotos)).toEqual(['{{number}}']);
    expect(placeholders((grnGu.review?.savedAfterLeavingPhotos ?? ''))).toEqual(['{{number}}']);
  });
});
