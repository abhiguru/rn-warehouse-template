/**
 * Filters, search and sort of the invoice list.
 *
 * `toRequest` is the only place a filter value becomes a request parameter
 * (see configs/grn.ts). Warehouse roles send the request to the backend;
 * customer accounts apply the same parameters in the app
 * (`selectCustomerInvoices`), because their list is assembled there.
 */
import { getAssignedCustomerInvoices, getInvoicesList } from '@/services/invoice-service';
import { t } from '@/i18n';
import { resolveDateRange } from '../datePresets';
import { currentSort, financialYearLabel, financialYearOf, readSearch } from '../filterModel';
import { customerSource } from '../pickerSources';
import type { DateRangeValue, FilterListConfig, NumberRangeValue } from '../types';
import { customerFilterVisible, endOfDay, ids, startOfDay } from './shared';

export interface InvoiceListRequest {
  p_sort_field: 'inv_date' | 'inv_no' | 'customer_name' | 'total';
  p_sort_direction: 'asc' | 'desc';
  p_financial_year?: number;
  p_inv_no_from?: number;
  p_inv_no_to?: number;
  p_search_grn_no?: string;
  p_search?: string;
  p_date_from?: string;
  p_date_to?: string;
  p_customer_ids?: string[];
}

/** How many financial years the Year filter offers, the current one first. */
const YEARS_OFFERED = 5;
const yearOptions = (today: Date) =>
  Array.from({ length: YEARS_OFFERED }, (_, index) => financialYearOf(today) - index).map(year => ({
    value: String(year),
    get label() { return financialYearLabel(year); },
  }));

export const INVOICE_FILTERS: FilterListConfig<InvoiceListRequest> = {
  listKey: 'invoice-list',
  // Labels are getters so they follow the app's language (see FieldBase in ../types).
  get title() { return t('filters.list.invoice.title'); },
  noun: ['invoice', 'invoices'],
  search: {
    get placeholder() { return t('filters.list.invoice.search'); },
    dates: true,
    range: 'integer',
    financialYear: true,
    dateField: 'date',
    rangeField: 'numberRange',
    yearField: 'year',
  },
  sort: {
    options: [
      { field: 'inv_date', get label() { return t('common.date'); }, kind: 'date' },
      { field: 'inv_no', get label() { return t('common.invoiceNumber'); }, get chipLabel() { return t('filters.sort.numberChip'); }, kind: 'number' },
      { field: 'customer_name', get label() { return t('common.customer'); }, kind: 'text' },
      { field: 'total', get label() { return t('common.total'); }, kind: 'amount' },
    ],
    default: { field: 'inv_date', order: 'desc' },
  },
  fields: [
    { kind: 'dateRange', key: 'date', get label() { return t('common.date'); }, icon: 'calendar-range' },
    {
      kind: 'picker',
      key: 'customers',
      get label() { return t('common.customer'); },
      icon: 'account',
      noun: ['customer', 'customers'],
      source: customerSource,
      visibleTo: customerFilterVisible,
    },
    {
      kind: 'choice',
      key: 'year',
      get label() { return t('filters.field.financialYear'); },
      icon: 'calendar-blank-outline',
      defaultValue: 'all',
      options: [{ value: 'all', get label() { return t('filters.option.allYears'); } }, ...yearOptions(new Date())],
    },
    { kind: 'numberRange', key: 'numberRange', get label() { return t('common.invoiceNumber'); }, icon: 'file-document-outline', integer: true },
    { kind: 'text', key: 'grn', get label() { return t('common.grnNumber'); }, icon: 'package-down', get placeholder() { return t('common.grnNumber'); } },
  ],
  fastFilters: ['date', 'customers', 'year'],

  toRequest(values, sort, _ctx, today = new Date()) {
    const search = readSearch(INVOICE_FILTERS, values, today);
    const active = currentSort(INVOICE_FILTERS, sort) ?? INVOICE_FILTERS.sort!.default;
    const request: InvoiceListRequest = {
      p_sort_field: active.field as InvoiceListRequest['p_sort_field'],
      p_sort_direction: active.order,
    };

    const customerIds = ids(values.customers);
    if (customerIds.length > 0) request.p_customer_ids = customerIds;

    const year = typeof values.year === 'string' && values.year !== 'all' ? Number(values.year) : search.financialYear;
    if (year) request.p_financial_year = year;

    const numbers = values.numberRange as NumberRangeValue | undefined;
    if (typeof numbers?.min === 'number') request.p_inv_no_from = Math.round(numbers.min);
    if (typeof numbers?.max === 'number') request.p_inv_no_to = Math.round(numbers.max);
    if (!numbers && search.range) {
      request.p_inv_no_from = Number(search.range.from);
      request.p_inv_no_to = Number(search.range.to);
    }

    if (typeof values.grn === 'string' && values.grn.trim()) request.p_search_grn_no = values.grn.trim();
    if (search.text) request.p_search = search.text;

    const dates = values.date ? resolveDateRange(values.date as DateRangeValue, today) : search.date ?? {};
    if (dates.from) request.p_date_from = startOfDay(dates.from);
    if (dates.to) request.p_date_to = endOfDay(dates.to);
    return request;
  },

  async fetchCount(request, ctx) {
    const params = { ...request, p_limit: 1, p_offset: 0 };
    const response = ctx.isWarehouseRole
      ? await getInvoicesList(params)
      : await getAssignedCustomerInvoices(ctx.assignedCustomers.map(customer => customer.id), params);
    if (!response.success) throw new Error(response.message || 'Count failed');
    return response.data.pagination.total_count;
  },
};
