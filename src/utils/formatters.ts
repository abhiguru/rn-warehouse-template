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
 * Format a weight with Indian grouping and up to two decimals, no trailing
 * zeros (style guide §12.3), e.g. "1,250.5 kg".
 *
 * @param weight - Weight in kg
 * @param decimals - Maximum number of decimal places (default 2)
 */
export const formatWeight = (
  weight: number | null | undefined,
  decimals: number = 2
): string => {
  if (weight === null || weight === undefined || isNaN(weight)) {
    return '0 kg';
  }
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(weight);
  return `${formatted} kg`;
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
 * A count with its noun, singular when 1 (§12.3): "1 item", "12 items",
 * "1 bag", "1,200 bags". Pass the plural when it is not noun + "s".
 */
export const formatCount = (
  count: number | null | undefined,
  singular: string,
  plural: string = `${singular}s`
): string => {
  const n = count === null || count === undefined || isNaN(count) ? 0 : count;
  return `${new Intl.NumberFormat('en-IN').format(n)} ${n === 1 ? singular : plural}`;
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parse a date-only string in local time, a timestamp, or a Date; null when invalid. */
export const toDate = (date: string | Date | null | undefined): Date | null => {
  if (!date) return null;
  let d: Date;
  if (typeof date === 'string') {
    d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseLocalISODate(date) : new Date(date);
  } else {
    d = date;
  }
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Format a date for display (style guide §12.3). Month names are spelled out
 * here rather than taken from the device locale, so every phone shows the same
 * text (some engines print "Sept" for en-IN).
 *
 * - `medium` (default): "9 Oct 2026"
 * - `short`: "9 Oct" in the current year, otherwise "9 Oct 2026" (list rows)
 * - `long`: "9 October 2026"
 * - `compact`: same as `short`; kept for older callers
 *
 * Returns "—" when the date is missing or invalid.
 */
export const formatDate = (
  date: string | Date | null | undefined,
  format: 'short' | 'medium' | 'long' | 'compact' = 'medium'
): string => {
  const d = toDate(date);
  if (!d) return '—';
  const day = d.getDate();
  const year = d.getFullYear();
  if (format === 'long') return `${day} ${MONTHS_LONG[d.getMonth()]} ${year}`;
  const month = MONTHS_SHORT[d.getMonth()];
  if ((format === 'short' || format === 'compact') && year === new Date().getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${year}`;
};

/** Month titles (§12.3): "October 2026" (long, timelines), "Oct 2026" (short, report rows), "Oct" (narrow, chart axes). */
export const formatMonth = (
  date: string | Date | null | undefined,
  format: 'short' | 'long' | 'narrow' = 'long'
): string => {
  const d = toDate(date);
  if (!d) return '—';
  // Chart axes: the month alone, "Oct".
  if (format === 'narrow') return MONTHS_SHORT[d.getMonth()];
  return `${(format === 'long' ? MONTHS_LONG : MONTHS_SHORT)[d.getMonth()]} ${d.getFullYear()}`;
};

/** "4:05 pm" (§12.3). */
export const formatTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '—';
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
};

/** "9 Oct 2026, 4:05 pm" (§12.3). */
export const formatDateTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  if (!d) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
};

/**
 * Mobile number with the +91 prefix and 5 + 5 grouping (§12.3):
 * "9876543210" or "+919876543210" -> "+91 98765 43210". Other lengths are
 * returned trimmed and unchanged.
 */
export const formatMobile = (mobile: string | null | undefined): string => {
  if (!mobile) return '';
  const digits = mobile.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (national.length !== 10) return mobile.trim();
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
};

/** One decimal, true minus sign, no space (§12.3): "−18.5°C". */
export const formatTemperature = (celsius: number | null | undefined): string => {
  if (celsius === null || celsius === undefined || isNaN(celsius)) return '—';
  const fixed = Math.abs(celsius).toFixed(1);
  return `${celsius < 0 && fixed !== '0.0' ? '\u2212' : ''}${fixed}°C`;
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
 * Section header for date-grouped lists (§12.3): "Today", "Yesterday",
 * "Tue, 6 Oct", or "Tue, 6 Oct 2025" outside the current year.
 */
export const formatSectionDate = (dateString: string): string => {
  const date = toDate(dateString);
  if (!date) return '—';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return `${WEEKDAYS_SHORT[date.getDay()]}, ${formatDate(date, 'short')}`;
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
    return '—';
  }

  const date = new Date(dateString);

  // Handle invalid date
  if (isNaN(date.getTime())) {
    return '—';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  // Handle negative time (future dates)
  if (diffMins < 0) {
    return 'Just now';
  }

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} h ago`;
  return formatDate(date, 'short');
};
