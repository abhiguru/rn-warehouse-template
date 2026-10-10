/**
 * Saving a GRN writes identifiers, counts and error codes to the device log.
 * The customer, sender and supervisor names, the note, photo addresses and
 * the server's own messages stay out of it.
 */
import { createGRN, updateGRN } from '../grnFormService';
import type { GRNHeaderData, GRNImageData } from '@/store/slices/grnFormSlice';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: async () => ({
    rpc: mockRpc,
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
  }),
}));
jest.mock('@/utils/submissionIdempotency', () => ({
  submissionIdempotencyKey: async () => 'warehouse-grn-fictional-key',
  grnUpdateIdempotencyKey: async () => 'warehouse-grn-update-fictional-key',
  beginGrnEditSession: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

const marker = 'FICTIONAL_PRIVATE_GRN_SENTINEL';
const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';

const savedPhoto: GRNImageData = {
  id: 'aaaaaaaa-2222-4333-8444-555555555555',
  fileName: 'book.webp',
  imageUrl: `https://facility.invalid/signed/book.webp?token=${marker}`,
  storagePath: `headers/${GRN_ID}/book.webp`,
  uploadStatus: 'completed',
  fileSize: 1200,
  mimeType: 'image/webp',
};
const header: GRNHeaderData = {
  gr_no: 'A0010',
  registration: marker,
  date: '2026-10-01',
  sender_id: '',
  sender_name: marker,
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: marker,
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: marker,
  note: marker,
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [savedPhoto],
};
const items = [{
  grn_trl_id: LINE_ID,
  item_table_id: '66666666-2222-4333-8444-555555555555',
  item_name: marker,
  packaging: 'Bag',
  qty: 10,
  stock: 10,
  weight: 50,
  rack: '',
  package_mark: marker,
  trl_images: [],
}];

const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  mockRpc.mockReset();
  spies.push(
    jest.spyOn(console, 'log').mockImplementation(() => {}),
    jest.spyOn(console, 'warn').mockImplementation(() => {}),
    jest.spyOn(console, 'error').mockImplementation(() => {})
  );
});
afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies.length = 0;
});
const logOutput = () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));

describe('create-GRN device log', () => {
  it('keeps the request and the answer out of the log, and still sends the request', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, message: marker, data: { grn_id: GRN_ID, gr_no: 'A0010', item_ids: [LINE_ID], item_mapping: [{ index: 0, item_id: LINE_ID, item_name: marker }] } },
      error: null,
    });

    const result = await createGRN({ header: { ...header, gr_images: [] }, items });

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('save_grn', expect.objectContaining({ p_customer_name: marker, p_note: marker }));
    expect(logOutput()).not.toContain(marker);
  });

  it.each(['transport', 'business', 'exception'])('gives the %s failure to the caller without logging its text', async (kind) => {
    if (kind === 'transport') mockRpc.mockResolvedValue({ data: null, error: { message: marker, code: 'P0001', details: marker, hint: marker } });
    else if (kind === 'business') mockRpc.mockResolvedValue({ data: { success: false, message: marker }, error: null });
    else mockRpc.mockRejectedValue(new Error(marker));

    const result = await createGRN({ header: { ...header, gr_images: [] }, items });

    expect(result.success).toBe(false);
    const logs = logOutput();
    expect(logs).not.toContain(marker);
    if (kind === 'transport') expect(logs).toContain('P0001');
  });
});

describe('update-GRN device log', () => {
  it('keeps the header, the lines, photo addresses and the answer out of the log', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, gr_id: GRN_ID, message: marker, stats: {} }, error: null });

    const result = await updateGRN(GRN_ID, { header, items });

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('update_grn', expect.objectContaining({ p_customer_name: marker, p_note: marker }));
    expect(logOutput()).not.toContain(marker);
  });

  it.each(['transport', 'business', 'exception'])('gives the %s failure to the caller without logging its text', async (kind) => {
    if (kind === 'transport') mockRpc.mockResolvedValue({ data: null, error: { message: marker, code: 'P0001', details: marker } });
    else if (kind === 'business') mockRpc.mockResolvedValue({ data: { success: false, message: marker, error_code: 'FICTIONAL_CODE' }, error: null });
    else mockRpc.mockRejectedValue(new Error(marker));

    const result = await updateGRN(GRN_ID, { header, items });

    expect(result.success).toBe(false);
    const logs = logOutput();
    expect(logs).not.toContain(marker);
    if (kind === 'transport') expect(logs).toContain('P0001');
    if (kind === 'business') expect(logs).toContain('FICTIONAL_CODE');
  });
});
