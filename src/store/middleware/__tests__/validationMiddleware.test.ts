import { validationMiddleware } from '../validationMiddleware';

function run(type: string, payload: unknown) {
  const next = jest.fn((a) => a);
  const store = { getState: () => ({}) } as never;
  (validationMiddleware as any)(store)(next)({ type, payload });
  return next.mock.calls[0][0].payload as Record<string, unknown>;
}

describe('validationMiddleware GRN header', () => {
  it('keeps a 20-character vehicle registration whole', () => {
    const value = 'T31-G45B-ABCDEFGHIJK';
    expect(value).toHaveLength(20);
    expect(run('grnForm/updateHeader', { registration: value }).registration).toBe(value);
  });

  it('cuts a vehicle registration at 20 characters', () => {
    expect(run('grnForm/updateHeader', { registration: 'A'.repeat(25) }).registration).toBe('A'.repeat(20));
  });
});
