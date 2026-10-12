/**
 * Avatars: the same person or customer gets the same initials and colour on
 * every screen (style guide §3.2, avatar palette).
 */
import type { ThemeTokens } from '@/theme/tokens';

/** The first letter or digit of a word, whole (a code point, not half of a surrogate pair). */
const FIRST_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Up to two initials: the first letter or digit of each of the first two words
 * that have one. "Sunrise Agro Foods" -> "SA"; "(A-One) Traders & Co." -> "AT";
 * "🧊 Ice Depot" -> "ID" (a symbol in front of a name is not an initial).
 *
 * A name with no letter or digit at all keeps the plain rule: the first
 * character of each of the first two words (whole characters, so an emoji is
 * drawn whole), and "?" when there is nothing.
 */
export function avatarInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters: string[] = [];
  for (const word of words) {
    const first = word.match(FIRST_LETTER_OR_DIGIT)?.[0];
    if (first) letters.push(first);
    if (letters.length === 2) break;
  }
  if (letters.length === 0) {
    return words
      .slice(0, 2)
      .map(word => String.fromCodePoint(word.codePointAt(0) ?? 0x3f))
      .join('')
      .toUpperCase();
  }
  return letters.join('').toUpperCase();
}

/** Stable index into the avatar palette for an id (or a name when there is no id). */
export function avatarIndex(key: string | number | null | undefined, paletteSize: number): number {
  const s = String(key ?? '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % paletteSize;
}

/**
 * Background and text colours for an avatar. Light mode uses pastel
 * backgrounds with primary text; dark mode uses deep backgrounds with white.
 */
export function avatarColors(
  key: string | number | null | undefined,
  t: ThemeTokens
): { background: string; text: string } {
  const background = t.avatar[avatarIndex(key, t.avatar.length)];
  return { background, text: t.mode === 'light' ? t.text.primary : t.overlay.onImage };
}
