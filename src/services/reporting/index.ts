/**
 * Reporting Services
 *
 * Exports all report-related service functions.
 */

// C1: Stock Summary
export { getCustomerStockSummary, getAllStockSummary } from './stock-summary-service';

// C3: Dispatch Activity
export {
  getCustomerDispatchActivity,
  getAllDispatchActivity,
  type DispatchActivityParams,
  type AllDispatchActivityParams,
} from './dispatch-activity-service';

// S1: Operations Dashboard
export {
  getOperationsDashboard,
  type OperationsDashboardParams,
} from './operations-dashboard-service';
