/**
 * Data Normalizer Utility
 *
 * D4 Fix: Provides consistent data extraction with fallback logging.
 * Helps debug which source field is being used when multiple fallbacks exist.
 */

type FieldValue = string | number | boolean | null | undefined;

interface ExtractOptions {
  /** Context for logging (e.g., 'InvoiceItem.itemName') */
  context?: string;
  /** Default value if all sources are empty */
  defaultValue?: FieldValue;
  /** Whether to log when using fallback (only in __DEV__) */
  logFallbacks?: boolean;
}

/**
 * Extract a value from multiple possible source fields.
 * Returns the first truthy value found, with optional fallback logging.
 *
 * @param sources - Array of [fieldName, value] pairs in priority order
 * @param options - Configuration options
 * @returns The first truthy value or the default value
 *
 * @example
 * const itemName = extractField([
 *   ['catalog.name', catalog?.name],
 *   ['grn_item.name', grnItem?.name],
 *   ['item_name', item.item_name],
 *   ['itemName', item.itemName],
 * ], { context: 'Invoice.itemName', defaultValue: 'Unknown Item' });
 */
export function extractField(
  sources: Array<[string, FieldValue]>,
  options: ExtractOptions = {}
): FieldValue {
  const { context = '', defaultValue = '', logFallbacks = true } = options;

  for (let i = 0; i < sources.length; i++) {
    const [fieldName, value] = sources[i];

    // Check for truthy value (but allow 0 and false as valid)
    if (value !== null && value !== undefined && value !== '') {
      // Log if using a fallback (not the primary source)
      if (i > 0 && logFallbacks && __DEV__) {
        console.warn(
          `[DataNormalizer] ${context}: Using fallback '${fieldName}' (primary sources empty)`
        );
      }
      return value;
    }
  }

  // All sources empty, return default
  if (logFallbacks && __DEV__ && context) {
    console.warn(
      `[DataNormalizer] ${context}: All sources empty, using default '${defaultValue}'`
    );
  }

  return defaultValue;
}

/**
 * Extract a string value with type coercion.
 */
export function extractString(
  sources: Array<[string, FieldValue]>,
  options: ExtractOptions = {}
): string {
  const value = extractField(sources, options);
  return String(value ?? options.defaultValue ?? '');
}

/**
 * Extract a number value with type coercion.
 */
export function extractNumber(
  sources: Array<[string, FieldValue]>,
  options: ExtractOptions = {}
): number {
  const value = extractField(sources, { ...options, defaultValue: 0 });
  const num = Number(value);
  return isNaN(num) ? (options.defaultValue as number) ?? 0 : num;
}

/**
 * Normalize an invoice item from various backend response formats.
 * Centralizes the field mapping logic for invoice items.
 */
export interface NormalizedInvoiceItem {
  id: string;
  itemName: string;
  duration: string;
  noOfDays: number;
  charge: number;
  tax: number;
  dispatchQty: number;
  grnQuantity: number;
  grNo: string;
  dispatchId: string;
  dispatchNo?: string;
  dispatchDate?: string;
  packageMark: string;
  rack: string;
  weight: number;
  packaging: string;
  labourRate: number;
}

export function normalizeInvoiceItem(
  item: Record<string, unknown>,
  logFallbacks = false
): NormalizedInvoiceItem {
  // Extract nested objects if present
  const catalog = (item.catalog as Record<string, unknown>) || {};
  const grnItem = (item.grn_item as Record<string, unknown>) || {};
  const dispatch = (item.dispatch as Record<string, unknown>) || {};

  return {
    id: extractString(
      [
        ['id', item.id as string],
        ['item_id', item.item_id as string],
      ],
      { context: 'InvoiceItem.id', defaultValue: '', logFallbacks }
    ),

    itemName: extractString(
      [
        ['catalog.name', catalog.name as string],
        ['grn_item.name', grnItem.name as string],
        ['item_name', item.item_name as string],
        ['itemName', item.itemName as string],
        ['name', item.name as string],
        ['catalog_name', item.catalog_name as string],
      ],
      { context: 'InvoiceItem.itemName', defaultValue: 'Unknown Item', logFallbacks }
    ),

    duration: extractString(
      [['duration', item.duration as string]],
      { context: 'InvoiceItem.duration', defaultValue: '', logFallbacks }
    ),

    noOfDays: extractNumber(
      [
        ['no_of_days', item.no_of_days as number],
        ['noOfDays', item.noOfDays as number],
      ],
      { context: 'InvoiceItem.noOfDays', defaultValue: 0, logFallbacks }
    ),

    charge: extractNumber(
      [
        ['charge', item.charge as number],
        ['total_charge', item.total_charge as number],
      ],
      { context: 'InvoiceItem.charge', defaultValue: 0, logFallbacks }
    ),

    tax: extractNumber(
      [
        ['tax', item.tax as number],
        ['tax_amount', item.tax_amount as number],
      ],
      { context: 'InvoiceItem.tax', defaultValue: 0, logFallbacks }
    ),

    dispatchQty: extractNumber(
      [
        ['dispatch.quantity', dispatch.quantity as number],
        ['dispatch_qty', item.dispatch_qty as number],
        ['dispatchQty', item.dispatchQty as number],
        ['quantity', item.quantity as number],
      ],
      { context: 'InvoiceItem.dispatchQty', defaultValue: 0, logFallbacks }
    ),

    grnQuantity: extractNumber(
      [
        ['grn_item.original_quantity', grnItem.original_quantity as number],
        ['grn_quantity', item.grn_quantity as number],
        ['grnQuantity', item.grnQuantity as number],
        ['original_quantity', item.original_quantity as number],
      ],
      { context: 'InvoiceItem.grnQuantity', defaultValue: 0, logFallbacks }
    ),

    grNo: extractString(
      [
        ['gr_no', item.gr_no as string],
        ['grNo', item.grNo as string],
      ],
      { context: 'InvoiceItem.grNo', defaultValue: '', logFallbacks }
    ),

    dispatchId: extractString(
      [
        ['dispatch.disp_id', dispatch.disp_id as string],
        ['disp_id', item.disp_id as string],
        ['dispatch_id', item.dispatch_id as string],
      ],
      { context: 'InvoiceItem.dispatchId', defaultValue: '', logFallbacks }
    ),

    dispatchNo: extractString(
      [
        ['dispatch.dispatch_no', dispatch.dispatch_no as string],
        ['dispatch_no', item.dispatch_no as string],
        ['dispatchNo', item.dispatchNo as string],
      ],
      { context: 'InvoiceItem.dispatchNo', logFallbacks }
    ) || undefined,

    dispatchDate: extractString(
      [
        ['dispatch.dispatch_date', dispatch.dispatch_date as string],
        ['dispatch_date', item.dispatch_date as string],
        ['dispatchDate', item.dispatchDate as string],
      ],
      { context: 'InvoiceItem.dispatchDate', logFallbacks }
    ) || undefined,

    packageMark: extractString(
      [
        ['grn_item.package_mark', grnItem.package_mark as string],
        ['package_mark', item.package_mark as string],
        ['packageMark', item.packageMark as string],
      ],
      { context: 'InvoiceItem.packageMark', defaultValue: '', logFallbacks }
    ),

    rack: extractString(
      [
        ['grn_item.rack', grnItem.rack as string],
        ['rack', item.rack as string],
      ],
      { context: 'InvoiceItem.rack', defaultValue: '', logFallbacks }
    ),

    weight: extractNumber(
      [
        ['grn_item.weight', grnItem.weight as number],
        ['weight', item.weight as number],
      ],
      { context: 'InvoiceItem.weight', defaultValue: 0, logFallbacks }
    ),

    packaging: extractString(
      [
        ['catalog.packaging', catalog.packaging as string],
        ['grn_item.packaging', grnItem.packaging as string],
        ['packaging', item.packaging as string],
      ],
      { context: 'InvoiceItem.packaging', defaultValue: '', logFallbacks }
    ),

    labourRate: extractNumber(
      [
        ['labour_rate', item.labour_rate as number],
        ['labourRate', item.labourRate as number],
      ],
      { context: 'InvoiceItem.labourRate', defaultValue: 0, logFallbacks }
    ),
  };
}
