/**
 * Whether a row of number fields (rent, labour, tax; From and Up to) stacks one under another: at large text
 * (TABLE_FALLBACK_SCALE) as before, and now also when the widest figure a field can hold (the rent limit, 9999.99)
 * does not fit the field's width at this text size and window, so a figure is never cut short by its neighbours.
 */
import { numberColumnWidth } from '@/components/common/DetailTable';
import { space, typography } from '@/theme/tokens';
import { TABLE_FALLBACK_SCALE } from './components/BandsTable';

/** The widest rent a field takes (priceNumbers RENT_MAX), as typed. */
const WIDEST_FIGURE = '9999.99';

export interface FigureRowInput {
  /** The window width in dp and the text size factor (`useWindowDimensions`). */
  width: number;
  fontScale: number;
  /** How many fields share the row. */
  count: number;
  /** The space between the window edge and the row's first field (screen margin, card padding, outline). */
  edge: number;
}

export function figuresStack({ width, fontScale, count, edge }: FigureRowInput): boolean {
  const scale = Math.max(1, fontScale || 1);
  if (scale >= TABLE_FALLBACK_SCALE) return true;
  if (count <= 1) return false;
  const field = (width - 2 * edge - (count - 1) * space.sm) / count;
  // Text in the regular body size, and the field's own padding on both sides.
  const text = numberColumnWidth({ scale, numberWidth: base => base }, 0, [WIDEST_FIGURE], [], typography.body.fontSize ?? 16);
  return text + 2 * space.md > field;
}
