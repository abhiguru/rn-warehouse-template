/**
 * GST on invoices (WH-151, backend migrations 173): the server makes the documents and works out every tax figure; the
 * app reads the preview exactly as sent (CGST and SGST or IGST, never worked out here), words the refusals and names the
 * document kinds. The real service runs, with only the server's reply faked. Fictional figures only.
 */
import { REFUSAL } from '@/utils/serverRefusal';
import { asDocType, docTypeKey, DOC_TYPES } from '@/features/gst/docType';
import { INDIAN_STATES, stateNameOf } from '@/features/gst/indianStates';
import { setLanguage, t } from '@/i18n';
import { asTreatment, documentRefusalText, pairDeleteRefusalText, previewInvoiceDocuments } from '../gstService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ origin: 'https://one.example.test', instanceId: 'instance-0001' }) }));

beforeEach(() => {
  mockRpc.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  setLanguage('en');
});

describe('previewInvoiceDocuments', () => {
  const answer = {
    success: true,
    current_doc_type: 'bill',
    type_changes: true,
    documents: [
      { doc_type: 'tax_invoice', item_names: ['Fictional potatoes', 7], subtotal: '1000.00', tax: 180, total: '1180', tax_head: 'cgst_sgst', place_of_supply: '24', cgst_amount: 90, sgst_amount: 90, igst_amount: null },
      { doc_type: 'bill_of_supply', item_names: ['Fictional onions'], subtotal: 500, tax: 0, total: 500, tax_head: null, place_of_supply: null },
      { doc_type: 'tax_invoice', item_names: [], subtotal: 100, tax: 18, total: 118, tax_head: 'igst', place_of_supply: '27', igst_amount: 18 },
    ],
  };

  it('asks the server for the lines of the GRN (the part before an underscore) and, for an edit, the invoice', async () => {
    mockRpc.mockResolvedValue({ data: answer, error: null });
    await previewInvoiceDocuments('grn-1_extra', ['d1', 'd2'], 'inv-9');
    expect(mockRpc).toHaveBeenCalledWith('preview_invoice_documents', { p_gr_id: 'grn-1', p_disp_trl_ids: ['d1', 'd2'], p_invoice_id: 'inv-9' });
    mockRpc.mockClear();
    await previewInvoiceDocuments('grn-1', ['d1']);
    expect(mockRpc).toHaveBeenCalledWith('preview_invoice_documents', { p_gr_id: 'grn-1', p_disp_trl_ids: ['d1'] });
  });

  it('reads the tax figures exactly as the server sent them, without working any out', async () => {
    mockRpc.mockResolvedValue({ data: answer, error: null });
    const result = await previewInvoiceDocuments('grn-1', ['d1']);
    if (!result.ok) throw new Error('expected a preview');
    const [tax, supply, igst] = result.preview.documents;
    expect(tax).toEqual({
      docType: 'tax_invoice', itemNames: ['Fictional potatoes'], subtotal: 1000, tax: 180, total: 1180, taxHead: 'cgst_sgst', placeOfSupply: '24', cgst: 90, sgst: 90, igst: null,
    });
    expect(supply).toMatchObject({ docType: 'bill_of_supply', tax: 0, total: 500, taxHead: null, placeOfSupply: null, cgst: null, sgst: null, igst: null });
    expect(igst).toMatchObject({ taxHead: 'igst', igst: 18, cgst: null, sgst: null });
    expect(result.preview).toMatchObject({ currentDocType: 'bill', typeChanges: true });
  });

  it('names no current type for a new invoice', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, documents: [] }, error: null });
    const result = await previewInvoiceDocuments('grn-1', ['d1']);
    expect(result).toEqual({ ok: true, preview: { documents: [], currentDocType: null, typeChanges: false } });
  });

  it('words a refusal in the app\'s words and keeps its reason', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, reason: REFUSAL.EDIT_NEEDS_TWO_DOCUMENTS }, error: null });
    const result = await previewInvoiceDocuments('grn-1', ['d1'], 'inv-9');
    expect(result).toEqual({ ok: false, reason: REFUSAL.EDIT_NEEDS_TWO_DOCUMENTS, message: t('gst.refusal.editNeedsTwo') });
  });

  it('shows no preview, with a plain message, for an answer that has no documents list', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    expect(await previewInvoiceDocuments('grn-1', ['d1'])).toEqual({ ok: false, message: t('gst.review.previewFailed') });
  });
});

describe('the words of a refusal', () => {
  it('names the invoice number that is out of range as the server sent it', () => {
    expect(documentRefusalText(REFUSAL.NUMBER_OUT_OF_RANGE, { number: 'SRT/100000000' })).toContain('SRT/100000000');
    expect(documentRefusalText(REFUSAL.UNKNOWN_LINE)).toBe(t('gst.refusal.unknownLine'));
    expect(documentRefusalText('SOMETHING_NEW')).toBeUndefined();
    expect(documentRefusalText(undefined)).toBeUndefined();
  });

  it('names the full invoice number of an invoice that has payments, else the plain sentence', () => {
    expect(pairDeleteRefusalText(REFUSAL.INVOICE_HAS_PAYMENTS, { inv_no: 12, invoice_label: 'SRT/12' })).toContain('SRT/12');
    expect(pairDeleteRefusalText(REFUSAL.INVOICE_HAS_PAYMENTS, { inv_no: 12 })).toContain('12');
    expect(pairDeleteRefusalText(REFUSAL.INVOICE_HAS_PAYMENTS, {})).toBe(t('invoice.cancel.hasPayments'));
    expect(pairDeleteRefusalText(REFUSAL.NOT_A_PAIR)).toBe(t('gst.pair.notAPair'));
    expect(pairDeleteRefusalText(REFUSAL.INVOICE_PAIR)).toBe(t('gst.pair.isPair'));
    expect(pairDeleteRefusalText('SOMETHING_NEW')).toBeUndefined();
  });
});

describe('document kinds, treatments and states', () => {
  it('reads a kind the app does not know as a plain invoice', () => {
    for (const kind of DOC_TYPES) expect(asDocType(kind)).toBe(kind);
    expect(asDocType('credit_note')).toBe('invoice');
    expect(asDocType(null)).toBe('invoice');
    expect(docTypeKey('nonsense')).toBe('gst.doc.invoice');
  });

  it('has a name for every kind in English and in Gujarati', () => {
    for (const kind of DOC_TYPES) {
      setLanguage('en');
      const english = t(docTypeKey(kind));
      setLanguage('gu');
      const gujarati = t(docTypeKey(kind));
      expect(english).not.toBe(docTypeKey(kind));
      expect(gujarati).toMatch(/[઀-૿]/);
    }
  });

  it('treats an item as taxable unless it is marked exempt (agricultural)', () => {
    expect(asTreatment('exempt_agri')).toBe('exempt_agri');
    expect(asTreatment('taxable')).toBe('taxable');
    expect(asTreatment(undefined)).toBe('taxable');
    expect(asTreatment('anything')).toBe('taxable');
  });

  it('names a state by its code, and shows an unknown code as it is', () => {
    expect(stateNameOf('24')).toBe('Gujarat');
    expect(stateNameOf('99xx')).toBe('99xx');
    expect(stateNameOf(null)).toBe('');
    expect(new Set(INDIAN_STATES.map((state) => state.code)).size).toBe(INDIAN_STATES.length);
  });
});
