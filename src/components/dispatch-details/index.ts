/**
 * Dispatch Details Components
 *
 * Mobile-first Material Design 3 components for Dispatch details screen
 */

export { DispatchHeroHeader } from './DispatchHeroHeader';
export { DispatchTabNavigator, type TabKey } from './DispatchTabNavigator';
export { DispatchOverviewTab } from './DispatchOverviewTab';
export { DispatchItemsTab, type DispatchItem } from './DispatchItemsTab';
export { DispatchGRNsTab, type GrnGroup } from './DispatchGRNsTab';
export { DispatchImagesTab, type DispatchImageData } from './DispatchImagesTab';
export { DispatchInvoicesTab, type InvoiceTable } from './DispatchInvoicesTab';
export { mapDispatchItems, groupBySourceGrn, itemTotals, buildInvoiceTable } from './dispatchDetailsModel';
