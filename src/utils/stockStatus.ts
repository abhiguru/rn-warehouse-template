/**
 * Stock Status Utility for SAP Fiori Design
 *
 * Maps stock quantities to SAP Fiori semantic status types
 * for consistent visual indication across the app.
 */

import { getTokens, type ThemeTokens } from '@/theme/tokens';

// SAP Fiori semantic status types
export type StockStatus = 'positive' | 'critical' | 'negative' | 'neutral';

export interface StockStatusResult {
  status: StockStatus;
  label: string;
  icon: string;
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

/**
 * Calculate stock status based on current stock and total quantity
 *
 * @param stock - Current stock count
 * @param qty - Total quantity
 * @returns StockStatusResult with status, label, icon, and percentage
 *
 * @example
 * getStockStatus(100, 100) // { status: 'positive', label: 'Full', ... }
 * getStockStatus(50, 100)  // { status: 'critical', label: 'Partial', ... }
 * getStockStatus(0, 100)   // { status: 'negative', label: 'Empty', ... }
 */
export function getStockStatus(stock: number, qty: number): StockStatusResult {
  // Handle undefined/null/NaN
  const safeStock = Number(stock) || 0;
  const safeQty = Number(qty) || 0;

  // No data case
  if (safeQty === 0) {
    return {
      status: 'neutral',
      label: 'N/A',
      icon: 'help-circle-outline',
      percentage: 0,
    };
  }

  const percentage = Math.round((safeStock / safeQty) * 100);

  // Empty stock
  if (safeStock === 0) {
    return {
      status: 'negative',
      label: 'Empty',
      icon: 'package-variant-closed-remove',
      percentage: 0,
    };
  }

  // Full stock
  if (safeStock >= safeQty) {
    return {
      status: 'positive',
      label: 'Full',
      icon: 'package-variant',
      percentage: 100,
    };
  }

  // Partial stock (0 < stock < qty)
  return {
    status: 'critical',
    label: 'Partial',
    icon: 'package-variant-minus',
    percentage,
  };
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
