/** The messages of a failed check, one per line; a message several fields share is listed once. */
export function validationSummary(errors: Record<string, string>): string {
  return [...new Set(Object.values(errors).filter(Boolean))].join('\n');
}
