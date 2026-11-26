/**
 * The signed-in person's role, for the read route (WH-299). The store hands it in (src/store/index.ts) instead of the
 * route importing the store: the services that read through the route are themselves imported by the store's slices.
 */
const source: { role: () => unknown } = { role: () => undefined };

export function provideCopyRole(role: () => unknown): void {
  source.role = role;
}

export const copyRole = (): unknown => source.role();
