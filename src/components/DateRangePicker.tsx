/**
 * DateRangePicker - Date selection modal for filtering
 *
 * Uses react-native-paper-dates for a pure JavaScript date picker
 * that properly supports dark mode in Expo Go.
 *
 * @example
 * ```tsx
 * <DateRangePicker
 *   visible={showFromDate}
 *   mode="from"
 *   currentDate={filters.fromDate}
 *   maxDate={filters.toDate}
 *   onSelect={(date) => setFilters({ ...filters, fromDate: date })}
 *   onClose={() => setShowFromDate(false)}
 * />
 * ```
 */

import React, { useCallback } from 'react';
import { DatePickerModal } from 'react-native-paper-dates';

interface DateRangePickerProps {
  visible: boolean;
  mode: 'from' | 'to';
  currentDate?: string;
  minDate?: string;
  maxDate?: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

export default function DateRangePicker({
  visible,
  mode,
  currentDate,
  minDate,
  maxDate,
  onSelect,
  onClose,
}: DateRangePickerProps) {
  // Parse date string to Date object
  const parseDate = (dateStr?: string): Date | undefined => {
    if (!dateStr) return undefined;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? undefined : date;
  };

  const handleConfirm = useCallback(
    (params: { date: Date | undefined }) => {
      if (params.date) {
        // Format as YYYY-MM-DD
        const year = params.date.getFullYear();
        const month = String(params.date.getMonth() + 1).padStart(2, '0');
        const day = String(params.date.getDate()).padStart(2, '0');
        onSelect(`${year}-${month}-${day}`);
      }
      onClose();
    },
    [onSelect, onClose]
  );

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <DatePickerModal
      locale="en"
      mode="single"
      visible={visible}
      onDismiss={handleDismiss}
      date={parseDate(currentDate)}
      onConfirm={handleConfirm}
      onChange={handleConfirm}
      validRange={{
        startDate: parseDate(minDate),
        endDate: parseDate(maxDate),
      }}
      label={mode === 'from' ? 'Select start date' : 'Select end date'}
    />
  );
}
