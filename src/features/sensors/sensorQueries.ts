/**
 * Query keys of the sensor screens and how the minute timer marks them out of date.
 *
 * The keys are given to `useReportQuery`, which files every key under `'report'`
 * (src/features/reports/useReportQuery.ts), so the cache holds them as
 * `['report', 'sensors', ...]`.
 */
import { queryClient } from '@/lib/queryClient';

export const sensorKeys = {
  snapshot: ['sensors', 'latest'] as const,
  device: (id: string) => ['sensors', 'device', id] as const,
  history: (id: string, days: number) => ['sensors', 'history', id, days] as const,
};

/**
 * Mark the latest sensor values out of date on the minute timer (`useSensorLiveUpdates`):
 * the list (`snapshot`) and every sensor's detail (`device`). A sensor query on screen
 * asks again at once, behind the rows it shows; one that is not shown asks when it is
 * next drawn. History is left alone: a change of the latest values does not move a
 * period's averages, and asking for a year of history every minute
 * would load the facility for nothing (pull to refresh and a return after 30 s ask for
 * it again). Other reports are left alone too.
 */
export async function invalidateSensorQueries(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['report', ...sensorKeys.snapshot] }),
    queryClient.invalidateQueries({ queryKey: ['report', 'sensors', 'device'] }),
  ]);
}
