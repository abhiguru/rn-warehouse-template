import { nationalMobileDigits } from '@/utils/formatters';
import { normalizeDigits } from '@/i18n';

/**
 * What the server is asked: Gujarati and other digits as 0-9, spaces collapsed, and a mobile
 * number typed with +91, spaces or dashes as its digits (the server matches digits).
 */
export function normalizeUserSearch(text: string): string {
  const collapsed = normalizeDigits(text).replace(/\s+/g, ' ').trim();
  if (!/^\+?[\d\s-]+$/.test(collapsed) || !/\d{2}/.test(collapsed)) return collapsed;
  const withoutCountry = collapsed.replace(/^\+\s*91[\s-]*/, '');
  const digits = nationalMobileDigits(withoutCountry);
  return digits || collapsed;
}
