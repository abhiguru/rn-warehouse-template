/**
 * WH-298 (Design Part 1, 1.4, with Design's answers to P8 and P9; contract 8.3; T44): the words of the status bar, word
 * for word, in English and Gujarati, with the unsent item called "એન્ટ્રી" (not "વસ્તુ", which also means a stock item).
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives) =====
 *  - keys `components.offlineStatus.{upToDate, updating, offline, updateFailed, firstLoad, olderLoading, olderPaused, notReady,
 *    unsent, sending, unsentLimit, storageLow, retryLabel}`; `unsent`, `sending`, `unsentLimit` are plural pairs on `count`;
 *    the time parameter is `time`; "Try again" is `common.retry`.
 * ============================================================
 */
import { setLanguage, t } from '@/i18n';

const K = (key: string) => `components.offlineStatus.${key}`;
afterEach(async () => { await setLanguage('en'); });

describe('English (Design 1.4)', () => {
  it.each([
    ['upToDate', {}, 'Up to date'],
    ['updating', { time: '10:42 am' }, 'Updating… Last updated 10:42 am'],
    ['offline', { time: '10:42 am' }, 'Offline. Last updated 10:42 am'],
    ['updateFailed', { time: '10:42 am' }, "Couldn't update. Last updated 10:42 am"],
    ['firstLoad', {}, 'Loading the warehouse onto this phone…'],
    ['notReady', {}, "This phone isn't ready yet. Connect to load the warehouse."],
    ['storageLow', {}, 'Phone storage is almost full. Free some space so records can be kept.'],
    ['retryLabel', {}, 'Try updating again'],
    ['unsent', { count: 1, time: '12:40 pm' }, '1 item not sent yet. Connect and send it by 12:40 pm.'],
    ['unsent', { count: 3, time: '12:40 pm' }, '3 items not sent yet. Connect and send them by 12:40 pm.'],
    ['sending', { count: 1 }, 'Sending 1 item…'],
    ['sending', { count: 2 }, 'Sending 2 items…'],
    ['unsentLimit', { count: 1 }, '1 item not sent for over 2 hours. Connect and send it to record more.'],
    ['unsentLimit', { count: 4 }, '4 items not sent for over 2 hours. Connect and send them to record more.'],
  ])('%s %j', (key, params, expected) => {
    expect(t(K(key) as never, params)).toBe(expected);
  });

  it('"Try again" is the common retry word', () => {
    expect(t('common.retry')).toBe('Try again');
  });
});

describe('Gujarati (Design 1.4, P8 and P9)', () => {
  beforeEach(async () => { await setLanguage('gu'); });

  it.each([
    ['upToDate', {}, 'અપડેટ છે'],
    ['firstLoad', {}, 'વખારની માહિતી આ ફોનમાં લોડ થઈ રહી છે…'],
    ['notReady', {}, 'આ ફોન હજુ તૈયાર નથી. વખારની માહિતી લોડ કરવા ઇન્ટરનેટ જોડો.'],
    ['storageLow', {}, 'ફોનમાં જગ્યા લગભગ ભરાઈ ગઈ છે. માહિતી સાચવી શકાય તે માટે થોડી જગ્યા ખાલી કરો.'],
    ['retryLabel', {}, 'ફરી અપડેટ કરવાનો પ્રયાસ કરો'],
  ])('%s', (key, params, expected) => {
    expect(t(K(key) as never, params)).toBe(expected);
  });

  it('the lines with a time keep the time inside the sentence', () => {
    for (const key of ['updating', 'offline', 'updateFailed']) expect(t(K(key) as never, { time: 'TIME-HERE' })).toContain('TIME-HERE');
  });

  it.each(['unsent', 'sending', 'unsentLimit'])('%s calls an unsent item "એન્ટ્રી", never "વસ્તુ", in the singular and the plural', key => {
    for (const count of [1, 3]) {
      const text = t(K(key) as never, { count, time: 'TIME-HERE' });
      expect(text).toContain('એન્ટ્રી');
      expect(text).not.toContain('વસ્તુ');
      expect(text).not.toContain(`{{`);
    }
  });

  it('the unsent line carries the clock time to send them by', () => {
    expect(t(K('unsent') as never, { count: 3, time: 'TIME-HERE' })).toContain('TIME-HERE');
  });
});
