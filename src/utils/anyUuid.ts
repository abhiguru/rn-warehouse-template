/**
 * One check for the id of a record the server gave the app (customer,
 * supervisor, GRN, lot, item, dispatch line, a route's id): any UUID the
 * database accepts (8-4-4-4-12 hex digits, any version, any variant, either
 * case). The app never refuses an id for its version; the server is the judge
 * of whether the record exists. (yup's `.uuid()` and a version-4 pattern both
 * refuse ids such as 2b273ab8-fc38-69cb-f981-21973070127f.)
 */
export const ANY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isAnyUuid = (value: unknown): value is string =>
  typeof value === 'string' && ANY_UUID.test(value);

/** yup `.matches` options that behave like `.uuid(message)` for an empty value (left to `.required`). */
export const anyUuidRule = (message: () => string) => ({
  name: 'uuid',
  message,
  excludeEmptyString: true,
});
