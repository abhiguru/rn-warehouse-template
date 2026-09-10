/**
 * Stock Status Utility for SAP Fiori Design
 *
 * Maps stock quantities to SAP Fiori semantic status types
 * for consistent visual indication across the app.
 */

import { listColors } from '@/theme/listColors';

// SAP Fiori semantic status types
export type StockStatus = 'positive' | 'critical' | 'negative' | 'neutral';

export interface StockStatusResult {
  status: StockStatus;
  label: string;
  icon: string;
  percentage: number;
}

export interface StockStatusColors {
  main: string;
  light: string;
  dark: string;
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

/**
 * Get color palette for a stock status
 *
 * @param status - Stock status type
 * @returns Object with main, light, dark, and border colors
 *
 * @example
 * const colors = getStatusColors('positive');
 * // { main: '#36A41D', light: '#F5FAE5', dark: '#256F14', border: '#5DC122' }
 */
export function getStatusColors(status: StockStatus): StockStatusColors {
  const colorMap: Record<StockStatus, StockStatusColors> = {
    positive: {
      main: listColors.statusPositive,
      light: listColors.statusPositiveLight,
      dark: listColors.statusPositiveDark,
      border: listColors.statusPositiveBorder,
    },
    critical: {
      main: listColors.statusCritical,
      light: listColors.statusCriticalLight,
      dark: listColors.statusCriticalDark,
      border: listColors.statusCriticalBorder,
    },
    negative: {
      main: listColors.statusNegative,
      light: listColors.statusNegativeLight,
      dark: listColors.statusNegativeDark,
      border: listColors.statusNegativeBorder,
    },
    neutral: {
      main: listColors.statusNone,
      light: listColors.statusNoneLight,
      dark: listColors.textTertiary,
      border: listColors.gray300,
    },
  };

  return colorMap[status];
}

/**
 * Combined utility to get both status info and colors
 *
 * @param stock - Current stock count
 * @param qty - Total quantity
 * @returns Object with status info and color palette
 */
export function getStockStatusWithColors(
  stock: number,
  qty: number
): StockStatusResult & { colors: StockStatusColors } {
  const statusResult = getStockStatus(stock, qty);
  const colors = getStatusColors(statusResult.status);

  return {
    ...statusResult,
    colors,
  };
}
