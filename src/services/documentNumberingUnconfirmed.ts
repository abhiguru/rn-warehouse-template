/**
 * set_document_numbering was sent and its answer did not come through (a lost connection, a timeout, a gateway error, an
 * empty or unreadable 200): the server may or may not hold the new rule. The screen keeps the edit open with the person's
 * values and offers "Refresh" (read the rule the server holds) and "Try again" (send the same rule: it sets an absolute value).
 * Kept apart from the service so a screen can test for it when the service is replaced.
 */
export class NumberingUnconfirmedError extends Error {
  readonly name = 'NumberingUnconfirmedError';
  constructor(message: string) {
    super(message);
  }
}
