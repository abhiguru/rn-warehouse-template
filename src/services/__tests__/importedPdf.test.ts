/** WH-180: PDFs of GRN, dispatch and invoice are asked for by `id` on a server that knows imported documents (migration 191). */
import { generateGRNPDF, generateDispatchPDF, generateInvoicePDF, pdfRefusal, pdfRefusalText } from '../pdf-service';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import { setLanguage } from '@/i18n';

const mockActive = { origin: 'https://one.example.test', instanceId: 'instance-0001' };
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockActive }));
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'http://localhost:28000' }),
  createAuthenticatedFetch: () => (...args: Parameters<typeof fetch>) => global.fetch(...args),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));

const originalFetch = global.fetch;
const ok = { success: true, pdf_url: 'http://localhost:28000/storage/v1/object/sign/documents/t.pdf?token=x', expires_in: 60 };
const reply = (body: Record<string, unknown>, status = 200) =>
  ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body }) as any;
const sentBody = () => JSON.parse(jest.mocked(fetch).mock.calls[0][1]!.body as string);

beforeEach(() => {
  resetFacilityRelease();
  jest.mocked(getAuthTokenString).mockResolvedValue('fictional-access-credential');
  global.fetch = jest.fn().mockResolvedValue(reply(ok));
});
afterEach(() => { global.fetch = originalFetch; setLanguage('en'); });

const calls = [
  ['GRN', (id?: string) => generateGRNPDF('FXG001', id), { gr_no: 'FXG001' }],
  ['dispatch', (id?: string) => generateDispatchPDF('FXD001', id), { disp_no: 'FXD001' }],
  ['invoice', (id?: string) => generateInvoicePDF(7, 2026, id), { inv_no: 7, fin_year: 2026 }],
] as const;

describe.each(calls)('the %s PDF', (_name, generate, number) => {
  it('is asked for by id on a server with migration 191, next to the number', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000191_imported_documents' });
    await generate('fictional-id-1');
    expect(sentBody()).toEqual({ ...number, id: 'fictional-id-1' });
  });

  it('does not send the id to an older server', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000190_x' });
    await generate('fictional-id-1');
    expect(sentBody()).toEqual(number);
  });

  it('sends no id when the screen has none', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000191_imported_documents' });
    await generate(undefined);
    expect(sentBody()).toEqual(number);
  });

  it('turns a 409 SEVERAL_DOCUMENTS answer into the several-documents refusal', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000191_imported_documents' });
    global.fetch = jest.fn().mockResolvedValue(reply({ success: false, error: 'Several documents', code: 'SEVERAL_DOCUMENTS' }, 409));
    const result = await generate('fictional-id-1');
    expect(result).toMatchObject({ success: false, refusal: 'severalDocuments' });
  });
});

it('knows the several-documents refusal only by status 409 and its code, in English and Gujarati', () => {
  expect(pdfRefusal(409, 'x', 'SEVERAL_DOCUMENTS')).toBe('severalDocuments');
  expect(pdfRefusal(400, 'x', 'SEVERAL_DOCUMENTS')).toBeUndefined();
  expect(pdfRefusal(409, 'x', 'OTHER')).toBeUndefined();
  expect(pdfRefusalText('severalDocuments')).toEqual({ title: 'Several documents', message: 'Several documents have this number. Update the app.' });
  setLanguage('gu');
  expect(pdfRefusalText('severalDocuments')).toEqual({ title: 'ઘણા દસ્તાવેજો', message: 'આ નંબરવાળા ઘણા દસ્તાવેજો છે. એપ અપડેટ કરો.' });
});
