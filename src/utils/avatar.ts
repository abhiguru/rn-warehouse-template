/**
 * Avatars: the same person or customer gets the same initials and colour on
 * every screen (style guide §3.2, avatar palette).
 */
import type { ThemeTokens } from '@/theme/tokens';

/** Up to two initials from the first two words: "Sunrise Agro Foods" -> "SA". */
export function avatarInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.slice(0, 2).map(w => w[0]);
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
