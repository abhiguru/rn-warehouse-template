/**
 * Stock status: the one rule for every screen (docs/STYLE_GUIDE.md §3.5).
 *
 * - No stock left (0 or less): "Out of stock", negative.
 * - Less than LOW_STOCK_RATIO (20%) of the original quantity left: "Low stock", critical.
 * - Otherwise: "In stock", positive. When the original quantity is unknown (0),
 *   any stock above 0 counts as in stock.
 *
 * StockIndicator and the list rows and headers read their status from here.
 */

import { getTokens, type ThemeTokens } from '@/theme/tokens';
import { t, type TranslationKey } from '@/i18n';
import type { IconName } from '@/types/icon.types';

/** Below this share of the original quantity, stock is low (critical). */
export const LOW_STOCK_RATIO = 0.2;

/** GRN list card, stock value colour: at or above this share left is positive (§3.5). */
export const STOCK_VALUE_HIGH_RATIO = 0.8;

/** GRN list card, stock value colour: at or above this share left (and below the high share) is critical. */
export const STOCK_VALUE_LOW_RATIO = 0.2;

// SAP Fiori semantic status types ('neutral' kept for colour lookups by callers)
export type StockStatus = 'positive' | 'critical' | 'negative' | 'neutral';

/** The levels the stock rule returns. */
export type StockLevel = 'positive' | 'critical' | 'negative';

export interface StockStatusResult {
  status: StockLevel;
  label: string;
  icon: IconName;
  /** Remaining stock as a whole percentage of the original quantity, 0 to 100. */
  percentage: number;
}

export interface StockStatusColors {
  /** Bars, dots and icons beside a label (status.*.element). */
  main: string;
  /** Tinted container behind status text (status.*.background). */
  light: string;
  /** Status words and icons on surfaces (status.*.text). */
  dark: string;
  /** Border of a status container (status.*.border). */
  border: string;
}

const STOCK_LABEL_KEYS: Record<StockLevel, TranslationKey> = {
  positive: 'common.inStock',
  critical: 'common.lowStock',
  negative: 'common.outOfStock',
};

/** The status word for a level in the app's language. */
export const getStockLabel = (level: StockLevel): string => t(STOCK_LABEL_KEYS[level]);

/** The standard §3.5 icon for each level (the same as StatusTag's STATUS_ICONS). */
export const STOCK_ICONS: Record<StockLevel, IconName> = {
  positive: 'check-circle',
  critical: 'alert',
  negative: 'alert-circle',
};

/**
 * The stock level for the remaining and the original quantity.
 *
 * @example
 * getStockLevel(0, 100)  // 'negative'
 * getStockLevel(19, 100) // 'critical'
 * getStockLevel(20, 100) // 'positive'
 */
export function getStockLevel(stock: number, originalQty: number): StockLevel {
  const safeStock = Number(stock) || 0;
  const safeQty = Number(originalQty) || 0;
  if (safeStock <= 0) return 'negative';
  if (safeQty > 0 && safeStock < safeQty * LOW_STOCK_RATIO) return 'critical';
  return 'positive';
}

/**
 * The colour level of the stock value on a GRN list card (§3.5). It colours the
 * number only; the tag beside it keeps `getStockLevel`.
 *
 * Nothing received (qty 0 or less): neutral. 80% or more left: positive. 20% up
 * to 80%: critical. Less than 20%, including 0: negative.
 *
 * @example
 * getStockValueLevel(80, 100) // 'positive'
 * getStockValueLevel(20, 100) // 'critical'
 * getStockValueLevel(19, 100) // 'negative'
 * getStockValueLevel(0, 0)    // 'neutral'
 */
export function getStockValueLevel(stock: number, qty: number): StockStatus {
  const safeStock = Number(stock) || 0;
  const safeQty = Number(qty) || 0;
  if (safeQty <= 0) return 'neutral';
  const ratio = safeStock / safeQty;
  if (ratio >= STOCK_VALUE_HIGH_RATIO) return 'positive';
  if (ratio >= STOCK_VALUE_LOW_RATIO) return 'critical';
  return 'negative';
}

/** Icon of the GRN list card's stock box, by the colour level of its value (WH-58). */
export const STOCK_VALUE_ICONS: Record<StockStatus, IconName> = {
  positive: 'package-variant',
  critical: 'package-variant-minus',
  negative: 'package-variant-closed-remove',
  neutral: 'help-circle-outline',
};

/**
 * The word of the GRN list card's badge (WH-58): nothing received N/A, nothing
 * left Empty, everything left Full, anything between Partial. The colour comes
 * from `getStockValueLevel`, so 85% left is a green Partial and 10% a red one.
 */
export function getStockBadgeLabel(stock: number, qty: number): string {
  const safeStock = Number(stock) || 0;
  const safeQty = Number(qty) || 0;
  if (safeQty <= 0) return t('lists.grn.badge.na');
  if (safeStock <= 0) return t('lists.grn.badge.empty');
  if (safeStock >= safeQty) return t('lists.grn.badge.full');
  return t('lists.grn.badge.partial');
}

/** True when the stock is low (critical) under the one rule. */
export function isLowStock(stock: number, originalQty: number): boolean {
  return getStockLevel(stock, originalQty) === 'critical';
}

/**
 * Stock status with its word, icon and remaining percentage.
 *
 * @example
 * getStockStatus(100, 100) // { status: 'positive', label: 'In stock', percentage: 100, ... }
 * getStockStatus(10, 100)  // { status: 'critical', label: 'Low stock', percentage: 10, ... }
 * getStockStatus(0, 100)   // { status: 'negative', label: 'Out of stock', percentage: 0, ... }
 */
export function getStockStatus(stock: number, qty: number): StockStatusResult {
  const safeStock = Number(stock) || 0;
  const safeQty = Number(qty) || 0;
  const status = getStockLevel(safeStock, safeQty);
  const percentage =
    safeQty > 0 ? Math.max(0, Math.min(100, Math.round((safeStock / safeQty) * 100))) : 0;
  return { status, label: getStockLabel(status), icon: STOCK_ICONS[status], percentage };
}

/** Fallback when no tokens are passed: the template's default (Orange light) theme. */
const DEFAULT_TOKENS = getTokens('orange', 'light');

/**
 * Get colours for a stock status from the semantic status tokens.
 *
 * Pass `tokens` from `useTokens()` so the colours follow the current brand and
 * mode. Without it the light-mode values are returned.
 *
 * @param status - Stock status type
 * @param tokens - Semantic tokens for the current theme
 * @returns Object with main (element), light (background), dark (text) and border colours
 *
 * @example
 * const t = useTokens();
 * const colors = getStatusColors('positive', t);
 * // { main: t.status.positive.element, light: t.status.positive.background, ... }
 */
export function getStatusColors(
  status: StockStatus,
  tokens: ThemeTokens = DEFAULT_TOKENS
): StockStatusColors {
  const s = tokens.status[status];
  return {
    main: s.element,
    light: s.background,
    dark: s.text,
    border: s.border,
  };
}

/**
 * Combined utility to get both status info and colors
 *
 * @param stock - Current stock count
 * @param qty - Total quantity
 * @param tokens - Semantic tokens for the current theme (from useTokens())
 * @returns Object with status info and color palette
 */
export function getStockStatusWithColors(
  stock: number,
  qty: number,
  tokens?: ThemeTokens
): StockStatusResult & { colors: StockStatusColors } {
  const statusResult = getStockStatus(stock, qty);
  const colors = getStatusColors(statusResult.status, tokens);

  return {
    ...statusResult,
    colors,
  };
}
