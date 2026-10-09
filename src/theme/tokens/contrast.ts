/**
 * WCAG 2.x contrast helpers, used by the token tests and the in-app style guide.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Parses #RGB, #RRGGBB or rgba(r,g,b,a); alpha is composited over `over`. */
export function parseColor(color: string, over = '#FFFFFF'): [number, number, number] {
  const hex = color.trim();
  if (hex.startsWith('#')) {
    const h = hex.length === 4 ? hex.slice(1).split('').map(x => x + x).join('') : hex.slice(1, 7);
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = hex.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (!m) throw new Error(`Unsupported colour: ${color}`);
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a >= 1) return [r, g, b];
  const [br, bg, bb] = parseColor(over);
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
}

export function relativeLuminance(color: string, over?: string): number {
  const [r, g, b] = parseColor(color, over);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between a foreground and its background (1 to 21). */
export function contrastRatio(foreground: string, background: string): number {
  const bg = relativeLuminance(background);
  const fg = relativeLuminance(foreground, background);
  const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA thresholds. */
export const AA = {
  /** Body text and small text. */
  text: 4.5,
  /** Text 18.66px bold / 24px regular and above, icons, borders, UI components. */
  large: 3,
} as const;
