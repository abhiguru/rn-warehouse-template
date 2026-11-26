/**
 * The signed-in person's role and name, as the auth slice has them (contract section 4: "role not `customer`"). Loaded when
 * asked, not when this file is imported, so the queue does not pull the store in at start-up.
 */
function profile(): { role?: unknown; name?: unknown; active?: unknown } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- loaded when first asked, see above
    const { store } = require('@/store') as typeof import('@/store');
    return store.getState().auth.userProfile;
  } catch {
    return null;
  }
}

/**
 * A customer account, or one that was deactivated, sends nothing: its unsent items are kept and wait for an administrator
 * (Product PQ5).
 */
export function cannotSendUnsent(): boolean {
  const person = profile();
  return person?.role === 'customer' || person?.active === false;
}

/** The name the signed-in person is shown by, kept with their unsent items for another person's strip (Design 4.2). */
export function currentPersonName(): string {
  const name = profile()?.name;
  return typeof name === 'string' ? name : '';
}
