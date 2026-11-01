/**
 * One request key per form (owner rule D22): the key made for a save is kept across Save presses until the server's
 * definite answer, or until the form changes (a different signature). A second press after a lost answer or a failure
 * before sending is then the identical request, which the server answers from its stored result instead of writing
 * again or refusing it as a change made by someone else.
 */
export interface RequestKeyKeeper {
  /** The key for the save with this signature: the held one when the form is unchanged, else a new one that is held. */
  keyFor(signature: string): string;
  /** The server gave a definite answer: the next save gets a new key. */
  settle(): void;
}

export function createRequestKeyKeeper(makeKey: () => string): RequestKeyKeeper {
  let held: { signature: string; key: string } | null = null;
  return {
    keyFor(signature) {
      if (!held || held.signature !== signature) held = { signature, key: makeKey() };
      return held.key;
    },
    settle() {
      held = null;
    },
  };
}
