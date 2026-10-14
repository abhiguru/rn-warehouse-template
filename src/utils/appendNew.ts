/**
 * Append a page of rows to the rows already held, skipping any whose id is
 * already there. Offset paging over a sort with ties can return one row on
 * two pages; two rows with one key would break the list.
 */
export function appendNew<T extends { id: string }>(held: T[], page: T[]): T[] {
  const seen = new Set(held.map(row => row.id));
  const added = page.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return added.length === 0 ? held : [...held, ...added];
}
