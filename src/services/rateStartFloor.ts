/**
 * The earliest day a rate may start (backend migration 86, B2 option c): the day of the facility's oldest
 * GRN. The rates read returns it as `earliest_start`; it is remembered here for the rate editor, which
 * reads the rates of one item and needs the floor with them. Until a server sends it (an older server)
 * the editor falls back to three years before today. Cleared with the other session state.
 */
let floor: string | null = null;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

export function rememberRateStartFloor(day: unknown): void {
  if (typeof day === 'string' && ISO_DAY.test(day)) floor = day.slice(0, 10);
}

export const getRateStartFloor = (): string | null => floor;

export function clearRateStartFloor(): void {
  floor = null;
}
