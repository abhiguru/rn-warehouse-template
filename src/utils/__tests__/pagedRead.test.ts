import { IncompleteReadError, readAllRows, type PageAnswer } from '../pagedRead';

/** A fake table of `n` rows: answers ranges as PostgREST does, cut at `cap` rows per answer. */
function fakeTable(n: number, options: { cap?: number; count?: boolean } = {}) {
  const all = Array.from({ length: n }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}` }));
  const calls: { from: number; to: number; ordered: boolean }[] = [];
  const page = async (from: number, to: number, ordered: boolean): Promise<PageAnswer<{ id: string }>> => {
    calls.push({ from, to, ordered });
    const rows = (ordered ? [...all].sort((a, b) => a.id.localeCompare(b.id)) : all).slice(from, Math.min(to + 1, from + (options.cap ?? Infinity)));
    return { data: rows, error: null, count: options.count === false ? undefined : n };
  };
  return { page, calls };
}

it('reads a short table in one unordered request, as before', async () => {
  const table = fakeTable(120);
  const { rows } = await readAllRows(table.page, 500);
  expect(rows).toHaveLength(120);
  expect(table.calls).toEqual([{ from: 0, to: 499, ordered: false }]);
});

it('pages 1,046 rows in three ordered requests of 500, every row once', async () => {
  const table = fakeTable(1046);
  const { rows } = await readAllRows(table.page);
  expect(rows).toHaveLength(1046);
  expect(new Set(rows.map(r => r.id)).size).toBe(1046);
  expect(table.calls.filter(c => c.ordered).map(c => [c.from, c.to])).toEqual([[0, 499], [500, 999], [1000, 1499]]);
});

it('reads a table of exactly one page: the second request is empty and ends it', async () => {
  const table = fakeTable(500);
  expect((await readAllRows(table.page)).rows).toHaveLength(500);
});

it('throws when a request fails, and returns no part of the list', async () => {
  const page = jest.fn()
    .mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ id: String(i) })), error: null })
    .mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ id: String(i) })), error: null })
    .mockResolvedValueOnce({ data: null, error: new Error('boom') });
  await expect(readAllRows(page)).rejects.toThrow('boom');
});

it('refuses a list that is shorter than the server counts (the answer is cut below it)', async () => {
  const table = fakeTable(1046, { cap: 300 });
  await expect(readAllRows(table.page)).rejects.toBeInstanceOf(IncompleteReadError);
});

it('does not compare with a count the server did not give', async () => {
  const table = fakeTable(700, { count: false });
  expect((await readAllRows(table.page)).rows).toHaveLength(700);
});
