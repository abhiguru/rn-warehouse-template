import { submissionIdempotencyKey } from '../submissionIdempotency';

jest.mock('expo-crypto', () => {
  const { createHash } = jest.requireActual('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algorithm: string, text: string) => createHash('sha256').update(text).digest('hex')),
  };
});

const receipt = { p_gr_no: 'FXF01', p_customer_id: 'fictional-customer-a', p_items: [{ item_id: 'potatoes', qty: 10 }] };
describe('document submission retry keys', () => {
  it('reuses an identical receipt key after reconstructing the form', async () => {
    const first = await submissionIdempotencyKey('grn', receipt);
    expect(first).toMatch(/^warehouse-grn-[a-f0-9]{64}$/);
    expect(await submissionIdempotencyKey('grn', JSON.parse(JSON.stringify(receipt)))).toBe(first);
  });
  it('is independent of object property insertion order', async () => {
    expect(await submissionIdempotencyKey('grn', { p_items: [{ qty: 10, item_id: 'potatoes' }], p_customer_id: 'fictional-customer-a', p_gr_no: 'FXF01' }))
      .toBe(await submissionIdempotencyKey('grn', receipt));
  });
  it('does not reuse a cached result after changing quantity or document', async () => {
    const original = await submissionIdempotencyKey('grn', receipt);
    expect(await submissionIdempotencyKey('grn', { ...receipt, p_items: [{ item_id: 'potatoes', qty: 11 }] })).not.toBe(original);
    expect(await submissionIdempotencyKey('grn', { ...receipt, p_gr_no: 'FXF02' })).not.toBe(original);
  });
  it('reuses a dispatch key but changes it for another lot or quantity', async () => {
    const body = { p_dispatch_data: { disp_no: 'FXF03', customer_id: 'fictional-customer-a' }, p_dispatch_items: [{ gr_trl_id: 'lot-a', disp_qty: 3 }], p_generate_invoice: true };
    const key = await submissionIdempotencyKey('dispatch', body);
    expect(await submissionIdempotencyKey('dispatch', JSON.parse(JSON.stringify(body)))).toBe(key);
    expect(await submissionIdempotencyKey('dispatch', { ...body, p_dispatch_items: [{ gr_trl_id: 'lot-a', disp_qty: 4 }] })).not.toBe(key);
    expect(await submissionIdempotencyKey('dispatch', { ...body, p_dispatch_items: [{ gr_trl_id: 'lot-b', disp_qty: 3 }] })).not.toBe(key);
  });
  it('separates operations and refuses unnumbered submissions', async () => {
    const both = { ...receipt, p_dispatch_data: { disp_no: 'FXF01' } };
    expect(await submissionIdempotencyKey('grn', both)).not.toBe(await submissionIdempotencyKey('dispatch', both));
    await expect(submissionIdempotencyKey('grn', { p_items: [] })).rejects.toThrow('document number');
    await expect(submissionIdempotencyKey('dispatch', { p_dispatch_data: { disp_no: '' } })).rejects.toThrow('document number');
  });
});
