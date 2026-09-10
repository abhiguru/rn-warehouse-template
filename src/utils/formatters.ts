/**
 * Shared formatting utilities for consistent display across the app
 */

/**
 * Format a number as Indian Rupee currency
 * Uses Intl.NumberFormat for proper localization
 *
 * @param amount - The amount to format
 * @param options - Optional formatting options
 * @returns Formatted currency string (e.g., "₹1,23,456.78")
 */
export const formatCurrency = (
  amount: number | null | undefined,
  options?: {
    showSymbol?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string => {
  const {
    showSymbol = true,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options || {};

  if (amount === null || amount === undefined || isNaN(amount)) {
    return showSymbol ? '₹0' : '0';
  }

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);

  return showSymbol ? `₹${formatted}` : formatted;
};

/**
 * Format a number with Indian number system grouping (lakhs, crores)
 *
 * @param num - The number to format
 * @param decimals - Optional number of decimal places to show
 * @returns Formatted number string (e.g., "1,23,456" or "8.5")
 */
export const formatNumber = (
  num: number | null | undefined,
  decimals?: number
): string => {
  if (num === null || num === undefined || isNaN(num)) {
    return decimals !== undefined ? '0'.padEnd(2 + decimals, '0').replace('00', '0.') : '0';
  }
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

/**
 * Format weight in kg with proper decimal places
 *
 * @param weight - Weight in kg
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted weight string (e.g., "12.50 kg")
 */
export const formatWeight = (
  weight: number | null | undefined,
  decimals: number = 2
): string => {
  if (weight === null || weight === undefined || isNaN(weight)) {
    return '0 kg';
  }
  return `${weight.toFixed(decimals)} kg`;
};

/**
 * Format quantity with optional unit
 *
 * @param qty - The quantity
 * @param unit - Optional unit label
 * @returns Formatted quantity string
 */
export const formatQuantity = (
  qty: number | null | undefined,
  unit?: string
): string => {
  if (qty === null || qty === undefined || isNaN(qty)) {
    return unit ? `0 ${unit}` : '0';
  }
  const formatted = new Intl.NumberFormat('en-IN').format(qty);
  return unit ? `${formatted} ${unit}` : formatted;
};

/**
 * Format a date for display
 * Handles both ISO date strings (YYYY-MM-DD) and full ISO timestamps
 * For date-only strings, parses in local timezone to avoid offset issues
 *
 * @param date - Date string (YYYY-MM-DD or ISO timestamp) or Date object
 * @param format - Format type: 'short', 'medium', 'long', 'compact'
 * @returns Formatted date string
 */
export const formatDate = (
  date: string | Date | null | undefined,
  format: 'short' | 'medium' | 'long' | 'compact' = 'medium'
): string => {
  if (!date) return '-';

  let dateObj: Date;

  if (typeof date === 'string') {
    // Check if it's a date-only string (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Parse as local date to avoid timezone offset
      dateObj = parseLocalISODate(date);
    } else {
      // Parse as full ISO timestamp
      dateObj = new Date(date);
    }
  } else {
    dateObj = date;
  }

  if (isNaN(dateObj.getTime())) return '-';

  // Compact format: DD/MM/YY
  if (format === 'compact') {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  const formatOptions: Record<string, Intl.DateTimeFormatOptions> = {
    short: { day: '2-digit', month: 'short' },
    medium: { day: '2-digit', month: 'short', year: '2-digit' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
  };
  const options = formatOptions[format];

  return dateObj.toLocaleDateString('en-IN', options);
};

/**
 * Format a percentage value
 *
 * @param value - The value (0-100 or 0-1 depending on isDecimal)
 * @param isDecimal - Whether the value is a decimal (0-1) or percentage (0-100)
 * @returns Formatted percentage string (e.g., "12.5%")
 */
export const formatPercentage = (
  value: number | null | undefined,
  isDecimal: boolean = false
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }
  const percentage = isDecimal ? value * 100 : value;
  return `${percentage.toFixed(1)}%`;
};

/**
 * Convert a Date object to ISO date string (YYYY-MM-DD) in local timezone
 * This avoids timezone offset issues when saving dates
 *
 * @param date - Date object to convert
 * @returns ISO date string in local timezone (e.g., "2025-10-29")
 */
export const toLocalISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse an ISO date string (YYYY-MM-DD) to a Date object in local timezone
 * This avoids timezone offset issues when reading dates
 *
 * @param dateString - ISO date string (e.g., "2025-10-29")
 * @returns Date object at midnight local time
 */
export const parseLocalISODate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Format a date string for section headers in lists
 * Returns "Today", "Yesterday", or formatted date
 *
 * @param dateString - ISO date string
 * @returns Formatted section header (e.g., "Today", "Yesterday", "Mon, 25 Nov")
 */
export const formatSectionDate = (dateString: string): string => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

/**
 * Format a date for relative time display (e.g., "2h ago", "Yesterday")
 *
 * @param dateString - ISO date string
 * @returns Relative time string
 */
export const formatRelativeTime = (dateString: string): string => {
  // Handle undefined/null/empty input
  if (!dateString) {
    if (__DEV__) console.warn('[formatRelativeTime] Called with empty dateString');
    return 'Unknown';
  }

  const date = new Date(dateString);

  // Handle invalid date
  if (isNaN(date.getTime())) {
    if (__DEV__) console.warn('[formatRelativeTime] Invalid date:', dateString);
    return 'Unknown';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Handle negative time (future dates)
  if (diffMins < 0) {
    if (__DEV__) console.warn('[formatRelativeTime] Future date detected:', dateString);
    return 'Just now';
  }

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
};
