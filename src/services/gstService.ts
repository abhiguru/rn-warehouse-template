/**
 * GST documents (backend migration 173, WH-151): the facility's GST details (administrators), an item's GST treatment
 * (administrators and supervisors), the review step's preview of the documents a save makes, and the delete of a pair.
 *
 * Every figure here is the server's. The app never works out tax, a split or a document type.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { serverReason } from '@/utils/serverText';
import { REFUSAL } from '@/utils/serverRefusal';
import { asDocType, type DocType, type TaxHead } from '@/features/gst/docType';
import { invalidateReportQueries } from '@/lib/queryClient';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const numberOrNull = (value: unknown): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// The facility's GST details
// ---------------------------------------------------------------------------

export interface GstDetails {
  /** False until an administrator saves once: documents are then made exactly as before. */
  saved: boolean;
  registered: boolean;
  gstin: string;
  stateName: string;
  legalName: string;
  address: string;
  sacStorage: string;
  sacLabour: string;
  savedByName: string | null;
}

export interface GstDetailsInput {
  registered: boolean;
  gstin: string;
  address: string;
  legalName: string;
  sacStorage: string;
  sacLabour: string;
}

/** The change was sent and no answer came: the server may hold the new details. */
export class GstUnconfirmedError extends Error {
  constructor() {
    super(t('gst.settings.unconfirmed'));
  }
}

function readDetails(value: unknown): GstDetails | null {
  if (!isRecord(value)) return null;
  return {
    saved: value.saved === true,
    registered: value.registered === true,
    gstin: text(value.gstin),
    stateName: text(value.state_name),
    legalName: text(value.legal_name),
    address: text(value.address),
    sacStorage: text(value.sac_storage),
    sacLabour: text(value.sac_labour),
    savedByName: textOrNull(value.saved_by_name),
  };
}

/** The details the server holds. Throws in the app's own words when they cannot be read. */
export async function getGstDetails(): Promise<GstDetails> {
  const result = await executeRPC<unknown>(getAuthenticatedClient, 'get_gst_details', undefined, {
    context: 'GstService.getGstDetails',
    errorMessage: t('gst.settings.loadFailed'),
    unwrapNested: true,
  });
  const details = result.success ? readDetails(result.data) : null;
  if (!details) throw new Error(result.success ? t('gst.settings.loadFailed') : result.message || t('gst.settings.loadFailed'));
  return details;
}

/** Saves the details; the answer is the details as the server now holds them. */
export async function setGstDetails(input: GstDetailsInput): Promise<GstDetails> {
  const result = await executeRPC<unknown>(
    getAuthenticatedClient,
    'set_gst_details',
    {
      p_details: {
        registered: input.registered,
        gstin: input.registered ? input.gstin.trim().toUpperCase() : null,
        address: input.address.trim(),
        legal_name: input.legalName.trim() || undefined,
        sac_storage: input.sacStorage.trim(),
        sac_labour: input.sacLabour.trim(),
      },
    },
    { context: 'GstService.setGstDetails', write: true, errorMessage: t('gst.settings.saveFailed'), unwrapNested: true }
  );
  if (!result.success) {
    if (result.lostAnswer) throw new GstUnconfirmedError();
    // SQLSTATE 22023: a value the server refused (the server's sentence stays hidden; the form checks the same shapes first).
    if (result.errorCode === '22023') throw new Error(t('gst.settings.refused'));
    throw new Error(result.message || t('gst.settings.saveFailed'));
  }
  const details = readDetails(result.data);
  if (!details) throw new Error(t('gst.settings.saveFailed'));
  return details;
}

// ---------------------------------------------------------------------------
// An item's GST treatment
// ---------------------------------------------------------------------------

export type GstTreatment = 'taxable' | 'exempt_agri';

export const asTreatment = (value: unknown): GstTreatment => (value === 'exempt_agri' ? 'exempt_agri' : 'taxable');

/** The item's treatment, read from the items table; null when it cannot be read (an older backend has no such column). */
export async function getItemGstTreatment(itemId: string): Promise<GstTreatment | null> {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.from('items').select('gst_treatment').eq('id', itemId).maybeSingle();
    if (error || !isRecord(data)) return null;
    return asTreatment(data.gst_treatment);
  } catch {
    return null;
  }
}

export class GstTreatmentUnconfirmedError extends Error {
  constructor() {
    super(t('gst.item.unconfirmed'));
  }
}

/** Sets the item's treatment (administrators and supervisors). Returns the treatment the server now holds. */
export async function setItemGstTreatment(itemId: string, treatment: GstTreatment): Promise<GstTreatment> {
  const result = await executeRPC<{ gst_treatment?: unknown }>(
    getAuthenticatedClient,
    'set_item_gst_treatment',
    { p_item_id: itemId, p_gst_treatment: treatment },
    { context: 'GstService.setItemGstTreatment', write: true, errorMessage: t('gst.item.saveFailed'), unwrapNested: true }
  );
  if (!result.success) {
    if (result.lostAnswer) throw new GstTreatmentUnconfirmedError();
    throw new Error(result.message || t('gst.item.saveFailed'));
  }
  return asTreatment(result.data?.gst_treatment);
}

// ---------------------------------------------------------------------------
// The review step: which document(s) the lines make
// ---------------------------------------------------------------------------

export interface PreviewDocument {
  docType: DocType;
  itemNames: string[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  taxHead: TaxHead | null;
  /** The state code of the place of supply (tax documents only). */
  placeOfSupply: string | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
}

export interface DocumentsPreview {
  documents: PreviewDocument[];
  /** An edit: the invoice's type now, and whether the lines make another type than that. */
  currentDocType: DocType | null;
  typeChanges: boolean;
}

/** The refusal of the preview, worded by the app: null for a failure that is not a refusal (the review shows no preview). */
export type PreviewResult = { ok: true; preview: DocumentsPreview } | { ok: false; reason?: string; message: string };

/** The app's own words for a refusal of the preview or the save that concerns the documents. */
export function documentRefusalText(reason: string | undefined, fields?: Record<string, unknown>): string | undefined {
  switch (reason) {
    case REFUSAL.EDIT_NEEDS_TWO_DOCUMENTS:
      return t('gst.refusal.editNeedsTwo');
    case REFUSAL.UNKNOWN_LINE:
      return t('gst.refusal.unknownLine');
    case REFUSAL.NUMBER_OUT_OF_RANGE:
      return t('gst.refusal.numberOutOfRange', { number: String(fields?.number ?? '') });
    default:
      return undefined;
  }
}

export async function previewInvoiceDocuments(grId: string, dispTrlIds: string[], invoiceId?: string | null): Promise<PreviewResult> {
  const result = await executeRPC<unknown>(
    getAuthenticatedClient,
    'preview_invoice_documents',
    {
      p_gr_id: grId.includes('_') ? grId.split('_')[0] : grId,
      p_disp_trl_ids: dispTrlIds,
      ...(invoiceId ? { p_invoice_id: invoiceId } : {}),
    },
    { context: 'GstService.previewInvoiceDocuments', errorMessage: t('gst.review.previewFailed'), unwrapNested: false }
  );
  if (!result.success) {
    return {
      ok: false,
      reason: result.reason,
      message: documentRefusalText(result.reason, result.fields) ?? t('gst.review.previewFailed'),
    };
  }
  const body = result.data;
  const list = isRecord(body) && Array.isArray(body.documents) ? body.documents : null;
  if (!isRecord(body) || !list) return { ok: false, message: t('gst.review.previewFailed') };
  const documents: PreviewDocument[] = list.filter(isRecord).map((doc) => ({
    docType: asDocType(doc.doc_type),
    itemNames: Array.isArray(doc.item_names) ? doc.item_names.filter((name): name is string => typeof name === 'string') : [],
    subtotal: numberOrNull(doc.subtotal),
    tax: numberOrNull(doc.tax),
    total: numberOrNull(doc.total),
    taxHead: doc.tax_head === 'igst' ? 'igst' : doc.tax_head === 'cgst_sgst' ? 'cgst_sgst' : null,
    placeOfSupply: textOrNull(doc.place_of_supply),
    cgst: numberOrNull(doc.cgst_amount),
    sgst: numberOrNull(doc.sgst_amount),
    igst: numberOrNull(doc.igst_amount),
  }));
  return {
    ok: true,
    preview: {
      documents,
      currentDocType: body.current_doc_type ? asDocType(body.current_doc_type) : null,
      typeChanges: body.type_changes === true,
    },
  };
}

// ---------------------------------------------------------------------------
// Deleting a pair
// ---------------------------------------------------------------------------

export interface DeletePairResponse {
  success: boolean;
  /** The worded message for a refusal or a failure, in the app's language. */
  message?: string;
  reason?: string;
  /** No answer came: both documents may be deleted (the pair goes together or not at all). */
  lostAnswer?: boolean;
  sentAt?: number;
  /** The server says the invoice is not there: deleted already, as the person wanted. */
  notFound?: boolean;
}

const INVOICE_NOT_FOUND = /invoice not found/i;

/** The app's words for each refusal of delete_invoice and delete_invoice_pair. */
export function pairDeleteRefusalText(reason: string | undefined, fields?: Record<string, unknown>): string | undefined {
  switch (reason) {
    case REFUSAL.STALE_RECORD:
      return t('invoice.details.deleteStale');
    case REFUSAL.INVOICE_HAS_PAYMENTS:
      return fields?.inv_no !== undefined && fields.inv_no !== null
        ? t('payments.hasPayments', { number: String(fields.inv_no) })
        : t('invoice.cancel.hasPayments');
    case REFUSAL.NOT_A_PAIR:
      return t('gst.pair.notAPair');
    case REFUSAL.INVOICE_PAIR:
      return t('gst.pair.isPair');
    default:
      return undefined;
  }
}

/**
 * Deletes both documents of a pair in one transaction (administrators and supervisors). If either is refused (payments,
 * a changed record, not found), neither is deleted.
 */
export async function deleteInvoicePair(
  invoiceId: string,
  expectedUpdatedAt?: string | null,
  linkedExpectedUpdatedAt?: string | null
): Promise<DeletePairResponse> {
  const sentAt = Date.now();
  const result = await executeRPC<unknown>(
    getAuthenticatedClient,
    'delete_invoice_pair',
    {
      p_invoice_id: invoiceId,
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_linked_expected_updated_at: linkedExpectedUpdatedAt ?? null,
    },
    { context: 'GstService.deleteInvoicePair', write: true, delete: true, errorMessage: t('errors.invoice.deleteFailed'), unwrapNested: false, validateSuccess: true }
  );
  if (!result.success) {
    if (INVOICE_NOT_FOUND.test(result.error ?? '')) {
      void invalidateReportQueries();
      return { success: false, message: result.message, notFound: true };
    }
    if (result.lostAnswer) return { success: false, lostAnswer: true, sentAt };
    const own = pairDeleteRefusalText(result.reason, result.fields);
    if (own) return { success: false, message: own, reason: result.reason };
    const reasoned = serverReason(result.error ?? '');
    return { success: false, message: reasoned ?? t('errors.invoice.deleteFailed'), ...(result.reason ? { reason: result.reason } : {}) };
  }
  void invalidateReportQueries();
  return { success: true };
}
