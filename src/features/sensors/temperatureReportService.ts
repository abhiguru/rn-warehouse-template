/**
 * The temperature report's reads (WH-157, backend migration 186): the sensors a report can be made for, and the rules of a
 * period. The figures and the PDF are the server's (generate-temperature-report-pdf); the phone works out nothing.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { createLogger } from '@/utils/logger';
import { serverText, transportText } from '@/utils/serverText';
import { reportBody, reportRefusal, refusedReport } from '@/services/reporting/reportEnvelope';
import type { TranslationKey } from '@/i18n';

const logger = createLogger('TemperatureReport');

export interface ReportSensor {
  id: string;
  name: string;
  location: string;
  active: boolean;
  /** ISO times; null when the server has none. */
  first_reading_at: string | null;
  last_reading_at: string | null;
}

export type ReportSensorsResult =
  | { success: true; data: ReportSensor[] }
  | { success: false; data: null; message: string; error?: unknown };

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const timeOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * The sensors a report can be made for: name and location only, for every role (a customer account too). The server
 * answers an array, or { success: true, data: [...] }; only sensors with readings are listed.
 */
export async function getReportSensors(): Promise<ReportSensorsResult> {
  const failed = t('reports.temperatureReport.loadError');
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('get_sensor_report_devices');
    if (error) {
      logger.error('[TemperatureReport] get_sensor_report_devices failed', error.message);
      return { success: false, data: null, message: transportText(error) ?? serverText(error.message, failed), error: error.code || error.message };
    }
    const refusal = reportRefusal(data);
    if (refusal) return refusedReport(refusal, null, failed);
    const body = reportBody(data) as unknown;
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
        ? (body as { data: unknown[] }).data
        : null;
    if (!rows) return { success: false, data: null, message: failed };
    return {
      success: true,
      data: rows
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map(row => ({
          id: text(row.id),
          name: text(row.name),
          location: text(row.location),
          active: row.active !== false,
          first_reading_at: timeOrNull(row.first_reading_at),
          last_reading_at: timeOrNull(row.last_reading_at),
        }))
        .filter(row => row.id !== ''),
    };
  } catch (error) {
    logger.error('[TemperatureReport] get_sensor_report_devices threw');
    return { success: false, data: null, message: transportText(error) ?? failed, error };
  }
}

/** A period (India dates, YYYY-MM-DD) the screen refuses before asking the server; the server stays the authority. */
export type PeriodProblem = 'periodTooLong' | 'periodTooOld';

/** The on-screen text of each problem and of the server's codes for them. */
export const PERIOD_TEXT: Readonly<Record<PeriodProblem | 'noReadingsInPeriod', TranslationKey>> = {
  periodTooLong: 'reports.temperatureReport.periodTooLong',
  periodTooOld: 'reports.temperatureReport.periodTooOld',
  noReadingsInPeriod: 'reports.temperatureReport.noReadingsInPeriod',
};

/** The server's refusal codes that have an on-screen text of their own. */
export function periodTextForCode(code: string | undefined): TranslationKey | undefined {
  switch (code) {
    case 'PERIOD_TOO_LONG':
      return PERIOD_TEXT.periodTooLong;
    case 'PERIOD_TOO_OLD':
      return PERIOD_TEXT.periodTooOld;
    case 'NO_READINGS':
      return PERIOD_TEXT.noReadingsInPeriod;
    default:
      return undefined;
  }
}

const parseDay = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** `day` moved by whole calendar months, a day past the month's end kept at its last day (31 Jan + 1 month = 28/29 Feb). */
function addMonths(day: string, months: number): number {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last));
}

/**
 * Whether the period breaks a limit: at most 12 months (To is at most From + 12 months - 1 day) and From no more than 2
 * years before `today`. Same rule as get_temperature_report. null: the period is allowed.
 */
export function periodProblem(from: string, to: string, today: string): PeriodProblem | null {
  if (parseDay(from) < addMonths(today, -24)) return 'periodTooOld';
  if (parseDay(to) > addMonths(from, 12) - 86_400_000) return 'periodTooLong';
  return null;
}
