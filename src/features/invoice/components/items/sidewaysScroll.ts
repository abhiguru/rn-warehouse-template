/**
 * The pure arithmetic of the line table's sideways scroll (unit-testable, no Reanimated): the least and
 * greatest offset, and where the offset must go so that a column is fully inside the visible part.
 * The offset is how far the scrolling columns are moved to the left (0 = the first column at the pinned one).
 */

/** The greatest offset: the scrolling columns' width less the visible width (0 when they fit). */
export const maxOffset = (content: number, viewport: number): number => Math.max(0, content - viewport);

/** `value` held in 0 to `max`. */
export const clampOffset = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

/**
 * The offset that shows the column [`left`, `left + width`) completely, moving as little as possible: the
 * current one when it is visible already, and never more than the table can scroll. A column wider than the
 * visible part is aligned to its left edge. `pad` leaves a little room beside the column (`padEnd` on its right
 * side, when that differs; the room on a side is what the edge cue there needs).
 */
export function revealOffset(offset: number, viewport: number, content: number, left: number, width: number, pad = 0, padEnd = pad): number {
  const max = maxOffset(content, viewport);
  if (viewport <= 0) return clampOffset(offset, max);
  const from = left - pad;
  const to = left + width + padEnd;
  if (to - from >= viewport) return clampOffset(from, max);
  if (from < offset) return clampOffset(from, max);
  if (to > offset + viewport) return clampOffset(to - viewport, max);
  return clampOffset(offset, max);
}
