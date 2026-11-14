/**
 * The reports of the app, in the order the Reports tab shows them.
 *
 * One table for the Reports tab (app/(tabs)/reports.tsx) and for the report routes of the
 * root stack (app/_layout.tsx). A report added here needs its screen at
 * app/reports/<id>.tsx; reportRegistry.test.ts checks that the three agree.
 */
import type { BackendFeature } from '@/config/backendFeatures';
import type { RoleGatedScreen } from '@/config/roles';
import type { IconName } from '@/types/icon.types';
import { t, type TranslationKey } from '@/i18n';

export type ReportId =
  | 'customer-activity'
  | 'stock-summary'
  | 'item-stock-summary'
  | 'dispatch-activity'
  | 'grn-activity'
  | 'invoice-history'
  | 'stock-aging'
  | 'operations-dashboard'
  | 'customer-dues'
  | 'statement'
  | 'temperature-report'
  | 'accountant-pack';

export type ReportCategory = 'stock' | 'movement' | 'financial' | 'operations';

export interface ReportDefinition {
  id: ReportId;
  /** The report screen's own title, in the app's language at the time it is read. */
  readonly title: string;
  /** The line under the title on the Reports tab, in the app's language at the time it is read. */
  readonly description: string;
  /** MaterialCommunityIcons name */
  icon: IconName;
  route: `/reports/${ReportId}`;
  category: ReportCategory;
  /** Whether the report covers a chosen period. False: it shows the stock as it is now. */
  hasPeriod: boolean;
  /**
   * The gate (`canOpenScreen` in src/config/roles.ts) of a report that only some roles are
   * offered. Without one the report is offered to every role. src/navigation/routeAccess.ts
   * guards the route with the same gate.
   */
  gate?: RoleGatedScreen;
  /**
   * Who the Reports tab offers the report to, when that is fewer than the route admits (`gate`): the Statement card is a
   * customer account's, while administrators and supervisors open a statement from another report. Without one, `gate`.
   */
  hubGate?: RoleGatedScreen;
  /** The backend feature the report needs (src/config/backendFeatures.ts): an older server is offered no such report. */
  feature?: BackendFeature;
}

interface ReportEntry {
  id: ReportId;
  title: TranslationKey;
  description: TranslationKey;
  icon: IconName;
  category: ReportCategory;
  hasPeriod: boolean;
  gate?: RoleGatedScreen;
  hubGate?: RoleGatedScreen;
  feature?: BackendFeature;
}

// Title and description are getters, so they follow the app's language (docs/I18N.md
// rule 2). Copying a definition with a spread would read them once and keep that text:
// pass the definition itself.
const define = (entry: ReportEntry): ReportDefinition => ({
  id: entry.id,
  get title() { return t(entry.title); },
  get description() { return t(entry.description); },
  icon: entry.icon,
  route: `/reports/${entry.id}`,
  category: entry.category,
  hasPeriod: entry.hasPeriod,
  gate: entry.gate,
  hubGate: entry.hubGate,
  feature: entry.feature,
});

export const REPORTS: readonly ReportDefinition[] = [
  define({
    id: 'customer-activity',
    title: 'reports.titles.customerActivity',
    description: 'nav.reports.descriptions.customerActivity',
    icon: 'account-group-outline',
    category: 'operations',
    hasPeriod: true,
  }),
  define({
    id: 'stock-summary',
    title: 'reports.titles.stockSummary',
    description: 'nav.reports.descriptions.stockSummary',
    icon: 'warehouse',
    category: 'stock',
    hasPeriod: false,
  }),
  define({
    id: 'item-stock-summary',
    title: 'reports.titles.itemStockSummary',
    description: 'nav.reports.descriptions.itemStockSummary',
    icon: 'cube-outline',
    category: 'stock',
    hasPeriod: false,
  }),
  define({
    id: 'dispatch-activity',
    title: 'reports.titles.dispatchActivity',
    description: 'nav.reports.descriptions.dispatchActivity',
    icon: 'truck-delivery-outline',
    category: 'movement',
    hasPeriod: true,
  }),
  define({
    id: 'grn-activity',
    title: 'reports.titles.grnActivity',
    description: 'nav.reports.descriptions.grnActivity',
    icon: 'package-down',
    category: 'movement',
    hasPeriod: true,
  }),
  define({
    id: 'invoice-history',
    title: 'reports.titles.invoiceHistory',
    description: 'nav.reports.descriptions.invoiceHistory',
    icon: 'file-document-outline',
    category: 'financial',
    hasPeriod: true,
  }),
  define({
    id: 'stock-aging',
    title: 'reports.titles.stockAging',
    description: 'nav.reports.descriptions.stockAging',
    icon: 'calendar-clock',
    category: 'stock',
    hasPeriod: false,
  }),
  // For administrators and supervisors: the server refuses it to staff and customer accounts.
  define({
    id: 'operations-dashboard',
    title: 'reports.titles.operationsDashboard',
    description: 'nav.reports.descriptions.operationsDashboard',
    icon: 'view-dashboard-outline',
    category: 'operations',
    hasPeriod: true,
    gate: 'operationsDashboard',
  }),
  // What each customer owes (WH-155, backend migration 176): administrators and supervisors.
  define({
    id: 'customer-dues',
    title: 'reports.titles.customerDues',
    description: 'nav.reports.descriptions.customerDues',
    icon: 'cash-clock',
    category: 'financial',
    hasPeriod: false,
    gate: 'customerDues',
    feature: 'customerStatement',
  }),
  // A customer's statement (WH-155): the card is a customer account's; administrators and supervisors open one from
  // Customer dues or Customer activity, through the same route.
  define({
    id: 'statement',
    title: 'reports.titles.statement',
    description: 'nav.reports.descriptions.statement',
    icon: 'file-account-outline',
    category: 'financial',
    hasPeriod: false,
    gate: 'customerStatement',
    hubGate: 'customerStatementCard',
    feature: 'customerStatement',
  }),
  // A sensor's readings for a period as a PDF (WH-157, backend migration 187): all four roles, where the facility has sensors.
  define({
    id: 'temperature-report',
    title: 'reports.titles.temperatureReport',
    description: 'nav.reports.descriptions.temperatureReport',
    icon: 'thermometer',
    category: 'operations',
    hasPeriod: true,
    gate: 'temperatureReport',
    feature: 'temperatureReport',
  }),
  // A month's invoices, receipts and stock as a zip for the accountant (WH-158, backend migration 204): administrators and supervisors.
  define({
    id: 'accountant-pack',
    title: 'reports.titles.accountantPack',
    description: 'nav.reports.descriptions.accountantPack',
    icon: 'folder-zip-outline',
    category: 'financial',
    hasPeriod: true,
    gate: 'accountantPack',
    feature: 'accountantPack',
  }),
];

/**
 * The report with this id. The id is compared with the ids of the table only, so a word
 * that names something every object has ("__proto__", "constructor") finds nothing.
 */
export function reportById(id: string): ReportDefinition | undefined {
  return REPORTS.find((report) => report.id === id);
}
