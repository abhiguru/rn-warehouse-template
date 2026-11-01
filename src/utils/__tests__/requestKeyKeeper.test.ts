import { createRequestKeyKeeper } from '../requestKeyKeeper';

describe('createRequestKeyKeeper', () => {
  it('keeps the key for the same signature until settled, and makes a new one for a changed form', () => {
    let n = 0;
    const keeper = createRequestKeyKeeper(() => `k${++n}`);
    expect(keeper.keyFor('a')).toBe('k1');
    expect(keeper.keyFor('a')).toBe('k1');
    expect(keeper.keyFor('b')).toBe('k2');
    keeper.settle();
    expect(keeper.keyFor('b')).toBe('k3');
  });
});
