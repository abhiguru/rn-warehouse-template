/**
 * Opening a GRN for editing, and asking the server what it holds after an
 * update whose answer was lost.
 *
 * RF-5: a photo list that could not be read is not "no photos". update_grn
 * deletes every photo row it is not sent, so a form opened without them would
 * delete them on Save.
 * RF-9: a row left 'pending' by an upload that could not be cancelled is not a photo.
 * RF-3: lines the form holds as new may already be on the GRN.
 */
import { findLinesSavedByLostUpdate, loadGRNData } from '../grnFormService';
import { grnUpdateIdempotencyKey } from '@/utils/submissionIdempotency';

type Row = Record<string, unknown>;
type Query = { table: string; filters: Array<[string, string, unknown]> };
const mockQueries: Query[] = [];
let mockAnswer: (query: Query) => { data: unknown; error: unknown };
let mockDetails: { data: unknown; error: unknown } = { data: { success: true, data: { grn: { rates: [] } } }, error: null };

jest.mock('@/config/supabaseConfig', () => {
  const builder = (table: string) => {
    const query: Query = { table, filters: [] };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      eq: (column: string, value: unknown) => { query.filters.push(['eq', column, value]); return chain; },
      in: (column: string, value: unknown) => { query.filters.push(['in', column, value]); return chain; },
      single: () => chain,
      then: (resolve: (answer: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        mockQueries.push(query);
        return Promise.resolve(mockAnswer(query)).then(resolve, reject);
      },
    };
    return chain;
  };
  return {
    beginOperatorMutation: () => jest.fn(),
    getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
    getAuthenticatedClient: async () => ({
      from: builder,
      rpc: async () => mockDetails,
      storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://facility.invalid/signed/${path}` }, error: null }) }) },
    }),
  };
});
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-crypto', () => {
  const { createHash, randomUUID } = jest.requireActual('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, text: string) => createHash('sha256').update(text).digest('hex'),
    randomUUID: () => randomUUID(),
  };
});

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const ITEM = '66666666-2222-4333-8444-555555555555';
const OTHER_ITEM = '88888888-2222-4333-8444-555555555555';

const headerRow = { id: GRN_ID, gr_no: 'A0010', date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders' };
const lineRow = { id: LINE_ID, gr_id: GRN_ID, item_id: ITEM, item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '' };
const photoRow = (id: string, type: 'header' | 'item'): Row => ({
  id, grn_id: GRN_ID, grn_item_id: type === 'item' ? LINE_ID : null, image_type: type, status: 'confirmed',
  storage_path: `${GRN_ID}/${id}.webp`, original_filename: `${id}.webp`,
});
const isPhotoQuery = (query: Query, type: 'header' | 'item') =>
  query.table === 'grn_images' && query.filters.some(([, column, value]) => column === 'image_type' && value === type);

/** The server with one header photo and three item photos; `failing` names the photo query that errors. */
const server = (failing?: 'header' | 'item') => (query: Query) => {
  if (query.table === 'goodsreceived') return { data: headerRow, error: null };
  if (query.table === 'goodsreceived_trl') return { data: [lineRow], error: null };
  for (const type of ['header', 'item'] as const) {
    if (!isPhotoQuery(query, type)) continue;
    if (failing === type) return { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
    return { data: type === 'header' ? [photoRow('h1', 'header')] : ['i1', 'i2', 'i3'].map((id) => photoRow(id, 'item')), error: null };
  }
  throw new Error(`unexpected query on ${query.table}`);
};

beforeEach(() => {
  mockQueries.length = 0;
  mockDetails = { data: { success: true, data: { grn: { rates: [] } } }, error: null };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('opening a GRN for editing', () => {
  it('loads the header photo and the item photos', async () => {
    mockAnswer = server();
    const result = await loadGRNData(GRN_ID);
    expect(result.success).toBe(true);
    expect(result.data?.header.gr_images.map((image) => image.id)).toEqual(['h1']);
    expect(result.data?.items[0].trl_images?.map((image) => image.id)).toEqual(['i1', 'i2', 'i3']);
  });

  it.each(['header', 'item'] as const)('fails when the %s photos cannot be read, instead of opening without them', async (failing) => {
    mockAnswer = server(failing);
    const result = await loadGRNData(GRN_ID);
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  });

  // RF-3: the same body is a new save once the GRN was read again; the answer
  // stored for the earlier edit must not be given in its place.
  it('starts a new edit session, so the keys of an earlier edit are not reused', async () => {
    const body = { p_grn_id: GRN_ID, p_note: 'same note' };
    const before = await grnUpdateIdempotencyKey(GRN_ID, body);
    expect(await grnUpdateIdempotencyKey(GRN_ID, body)).toBe(before);

    mockAnswer = server();
    expect((await loadGRNData(GRN_ID)).success).toBe(true);

    expect(await grnUpdateIdempotencyKey(GRN_ID, body)).not.toBe(before);
  });

  // Backend migration 86: the rates for this GRN only are part of what Save sends back, so the load reads them.
  it('seeds the form with the rates for this GRN only from get_grn_details', async () => {
    mockAnswer = server();
    mockDetails = {
      data: { success: true, data: { grn: { rates: [{ id: 'r1', item_id: ITEM, item_name: 'Example Potatoes', price_type: 'monthly', weight_min: 41, weight_max: 60, unit_price: '4.50', labour_rate: 1, tax_percent: 5, archived: false }] } } },
      error: null,
    };
    const result = await loadGRNData(GRN_ID);
    expect(result.data?.grnRates).toEqual([{ item_id: ITEM, price_type: 'monthly', saved: true, weight_min: 41, weight_max: 60, unit_price: 4.5, labour_rate: 1, tax_percent: 5 }]);
  });

  it('has no rates of its own for an older server without them', async () => {
    mockAnswer = server();
    mockDetails = { data: { success: true, data: { grn: {} } }, error: null };
    expect((await loadGRNData(GRN_ID)).data?.grnRates).toEqual([]);
  });

  it('fails when the rates cannot be read, instead of opening with an empty set that Save would send', async () => {
    mockAnswer = server();
    mockDetails = { data: null, error: { message: 'Network request failed', code: '' } };
    const result = await loadGRNData(GRN_ID);
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  });

  // Review D3: the server answers its own failures as {success:false, data:null}, not as a transport error.
  it.each([
    [{ success: false, data: null, message: 'Error retrieving GRN details: boom' }],
    [{ success: false, data: null, message: 'GRN not found or access denied' }],
    [{ success: true, data: {} }],
  ])('fails when get_grn_details answers %j, instead of opening with an empty set that Save would send', async answer => {
    mockAnswer = server();
    mockDetails = { data: answer, error: null };
    const result = await loadGRNData(GRN_ID);
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it('knows an invoiced GRN from grn.invoiced, or from an archived rate', async () => {
    mockAnswer = server();
    mockDetails = { data: { success: true, data: { grn: { invoiced: true, rates: [] } } }, error: null };
    expect((await loadGRNData(GRN_ID)).data?.grnInvoiced).toBe(true);
    mockDetails = { data: { success: true, data: { grn: { rates: [{ item_id: ITEM, price_type: 'monthly', weight_min: 0, weight_max: 9, unit_price: 1, labour_rate: 1, tax_percent: 5, archived: true }] } } }, error: null };
    expect((await loadGRNData(GRN_ID)).data?.grnInvoiced).toBe(true);
    mockDetails = { data: { success: true, data: { grn: { invoiced: false, rates: [] } } }, error: null };
    expect((await loadGRNData(GRN_ID)).data?.grnInvoiced).toBe(false);
  });

  it('asks for confirmed photos only', async () => {
    mockAnswer = server();
    await loadGRNData(GRN_ID);
    const photoQueries = mockQueries.filter((query) => query.table === 'grn_images');
    expect(photoQueries).toHaveLength(2);
    for (const query of photoQueries) expect(query.filters).toContainEqual(['eq', 'status', 'confirmed']);
  });
});

describe('after an update whose answer was lost', () => {
  const saved = (id: string, overrides: Row = {}): Row => ({ id, item_id: ITEM, packaging: 'Bag', qty: 100, weight: 5000, rack: 'R1/F1/C4', package_mark: 'AB', ...overrides });
  const formLine = (id: string, overrides: Row = {}) =>
    ({ grn_trl_id: id, item_table_id: ITEM, packaging: 'Bag', qty: 100, weight: 5000, rack: 'R1/F1/C4', package_mark: 'AB', ...overrides }) as never;
  const lines = (rows: Row[]) => { mockAnswer = () => ({ data: rows, error: null }); };

  it('finds the added line on the GRN, so the next Save updates it', async () => {
    lines([saved(LINE_ID, { qty: 10 }), saved('99999999-2222-4333-8444-555555555555')]);
    const result = await findLinesSavedByLostUpdate(GRN_ID, [formLine(LINE_ID, { qty: 10 }), formLine('item-1700000000000-abc')]);
    expect(result).toEqual({ success: true, adopted: { 'item-1700000000000-abc': '99999999-2222-4333-8444-555555555555' } });
    expect(mockQueries[0]).toEqual({ table: 'goodsreceived_trl', filters: [['eq', 'gr_id', GRN_ID]] });
  });

  it('adopts nothing when the update never reached the server', async () => {
    lines([saved(LINE_ID, { qty: 10 })]);
    expect(await findLinesSavedByLostUpdate(GRN_ID, [formLine(LINE_ID, { qty: 10 }), formLine('item-new')])).toEqual({ success: true, adopted: {} });
  });

  it('does not pair a new line with a saved line that differs, or with one the form already holds', async () => {
    lines([saved(LINE_ID), saved('99999999-2222-4333-8444-555555555555', { item_id: OTHER_ITEM }), saved('aaaaaaaa-2222-4333-8444-555555555555', { qty: 99 })]);
    // The new line equals LINE_ID's values, but LINE_ID is a line the form already has.
    expect(await findLinesSavedByLostUpdate(GRN_ID, [formLine(LINE_ID), formLine('item-new')])).toEqual({ success: true, adopted: {} });
  });

  it('pairs two equal new lines with two saved lines, each once', async () => {
    lines([saved('99999999-2222-4333-8444-555555555555'), saved('aaaaaaaa-2222-4333-8444-555555555555')]);
    const result = await findLinesSavedByLostUpdate(GRN_ID, [formLine('item-a'), formLine('item-b'), formLine('item-c')]);
    expect(result).toEqual({
      success: true,
      adopted: { 'item-a': '99999999-2222-4333-8444-555555555555', 'item-b': 'aaaaaaaa-2222-4333-8444-555555555555' },
    });
  });

  it('says so when the server cannot be asked', async () => {
    mockAnswer = () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
    const result = await findLinesSavedByLostUpdate(GRN_ID, [formLine('item-new')]);
    expect(result.success).toBe(false);
  });
});
