import { ORDER_PAGE_MAX, mergeRefreshedOrders, refreshLimit } from '../refreshWindow';

const rows = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ id: `o${from + i}`, v: 'old' }));

describe('refreshLimit', () => {
  it('asks for every row shown, at least a page, never over the server\'s 200', () => {
    expect(refreshLimit(0)).toBe(20);
    expect(refreshLimit(60)).toBe(60);
    expect(refreshLimit(200)).toBe(200);
    expect(refreshLimit(450)).toBe(ORDER_PAGE_MAX);
  });
});

describe('mergeRefreshedOrders', () => {
  it('is the refreshed rows when they cover everything shown', () => {
    const fresh = [{ id: 'o2', v: 'new' }, { id: 'o1', v: 'new' }];
    expect(mergeRefreshedOrders(rows(1, 5), fresh, 5, 20)).toEqual(fresh);
    expect(mergeRefreshedOrders(rows(1, 200), rows(1, 200).map(r => ({ ...r, v: 'new' })), 200, 200)).toHaveLength(200);
  });

  it('keeps the rows beyond 200 instead of shrinking the list', () => {
    const current = rows(1, 450);
    const fresh = rows(1, 200).map(r => ({ ...r, v: 'new' }));
    const merged = mergeRefreshedOrders(current, fresh, 450, 200);
    expect(merged).toHaveLength(450);
    expect(merged[0]).toEqual({ id: 'o1', v: 'new' });
    expect(merged[199]).toEqual({ id: 'o200', v: 'new' });
    expect(merged[200]).toEqual({ id: 'o201', v: 'old' });
  });

  it('lists an order that moved up into the refreshed rows once, and drops one deleted inside the window', () => {
    const current = rows(1, 450);
    // o300 moved to the top; o5 is gone; the window is still 200 rows.
    const fresh = [{ id: 'o300', v: 'new' }, ...rows(1, 200).filter(r => r.id !== 'o5').map(r => ({ ...r, v: 'new' }))].slice(0, 200);
    const merged = mergeRefreshedOrders(current, fresh, 450, 200);
    expect(merged.filter(r => r.id === 'o300')).toHaveLength(1);
    expect(merged.some(r => r.id === 'o5')).toBe(false);
    expect(merged.slice(0, 200)).toEqual(fresh);
    expect(merged[200].id).not.toBe('o300');
  });
});
