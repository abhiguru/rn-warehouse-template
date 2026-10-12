/**
 * The sections of the Reports tab (app/(tabs)/reports.tsx), in order:
 *
 *   pinned      the reports this account pinned, in the order it pinned them
 *   recent      up to three reports it opened last, most recent first, none of them pinned
 *   stock, movement, financial, operations
 *               every report it may open, by the registry's category, in registry order
 *
 * A section with no report is left out. A stored id that the registry does not know, or
 * that names a report this role may not open, is skipped (and does not count toward the
 * three recent ones): the stored lists outlive a role change and an app update.
 */
import { canOpenScreen } from '@/config/roles';
import { REPORTS, reportById, type ReportCategory, type ReportDefinition } from '@/features/reports/reportRegistry';

export type ReportHubSectionId = 'pinned' | 'recent' | ReportCategory;

export interface ReportHubSection {
  id: ReportHubSectionId;
  /** The registry's own definitions, never copies: their title and description follow the language. */
  reports: ReportDefinition[];
}

/** How many recently opened reports the tab shows. */
export const HUB_RECENT_LIMIT = 3;

const CATEGORIES: readonly ReportCategory[] = ['stock', 'movement', 'financial', 'operations'];

/** Whether this role is offered the report: the gate the route guard uses (src/navigation/routeAccess.ts). */
export function mayOpenReport(role: string | null | undefined, report: ReportDefinition): boolean {
  return !report.gate || canOpenScreen(role, report.gate);
}

/** The reports these stored ids name that the role may open, each once, in the stored order. */
function openable(role: string | null | undefined, ids: readonly string[]): ReportDefinition[] {
  const reports: ReportDefinition[] = [];
  for (const id of ids) {
    const report = reportById(id);
    if (report && mayOpenReport(role, report) && !reports.includes(report)) reports.push(report);
  }
  return reports;
}

export function reportHubSections(
  role: string | null | undefined,
  pinned: readonly string[],
  recent: readonly string[]
): ReportHubSection[] {
  const pinnedReports = openable(role, pinned);
  const recentReports = openable(role, recent)
    .filter((report) => !pinnedReports.includes(report))
    .slice(0, HUB_RECENT_LIMIT);
  const sections: ReportHubSection[] = [
    { id: 'pinned', reports: pinnedReports },
    { id: 'recent', reports: recentReports },
    ...CATEGORIES.map((category) => ({
      id: category,
      reports: REPORTS.filter((report) => report.category === category && mayOpenReport(role, report)),
    })),
  ];
  return sections.filter((section) => section.reports.length > 0);
}
