/**
 * The connection history (backend migration 188, WH-177): `get_connection_history()`, administrators only. 30 rows, today first.
 * The phones' side (the notes and their hand-over) is src/config/connectionHistory.ts.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';

export interface ConnectionDay {
  /** 'YYYY-MM-DD', the server's India day. */
  day: string;
  gaps: number;
  longestS: number;
  totalS: number;
  phones: number;
  savesTried: number;
  lostAnswers: number;
}

const count = (value: unknown): number => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Reads the rows; throws an AppError with the app's words when they cannot be read. */
export async function getConnectionHistory(): Promise<ConnectionDay[]> {
  const result = await executeRPC<{ days?: unknown }>(getAuthenticatedClient, 'get_connection_history', {}, {
    context: 'ConnectionHistory.get',
    validateSuccess: false,
  });
  if (!result.success) {
    if (result.errorCode === 'PGRST202' || result.errorCode === '42883') throw new AppError('REFUSED', t('connectionHistory.unsupported'));
    throw new Error(result.message || t('connectionHistory.loadFailed'));
  }
  const days = result.data?.days;
  if (!Array.isArray(days)) throw new Error(t('connectionHistory.loadFailed'));
  return days.flatMap((raw): ConnectionDay[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const r = raw as Record<string, unknown>;
    if (typeof r.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return [];
    return [{
      day: r.day,
      gaps: count(r.gaps),
      longestS: count(r.longest_s),
      totalS: count(r.total_s),
      phones: count(r.phones),
      savesTried: count(r.saves_tried),
      lostAnswers: count(r.lost_answers),
    }];
  });
}
