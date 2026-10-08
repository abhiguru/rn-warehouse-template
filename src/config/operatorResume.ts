// Public identity verification gates credential-bearing work after backgrounding.
// Keep credentials and drafts intact when discovery fails; callers can retry.
export function createOperatorResumeGate() {
  let epoch = 0;
  let required = false;
  let verifier: ((isCurrent: () => boolean) => Promise<boolean>) | undefined;
  let pending: { epoch: number; promise: Promise<boolean> } | undefined;
  const listeners = new Set<() => void>();
  return {
    installVerifier(value: (isCurrent: () => boolean) => Promise<boolean>) {
      verifier = value;
      return () => {
        if (verifier === value) verifier = undefined;
      };
    },
    suspend() {
      epoch += 1;
      required = true;
      for (const listener of listeners) listener();
    },
    onSuspend(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isVerified: () => !required,
    async ensureVerified(): Promise<boolean> {
      if (!required) return true;
      if (pending?.epoch === epoch) return pending.promise;
      if (!verifier) return false;
      const run = epoch;
      const verify = verifier;
      const request = {
        epoch: run,
        promise: Promise.resolve()
          .then(() => (run === epoch ? verify(() => run === epoch) : false))
          .then(verified => {
            if (run !== epoch) return false;
            if (verified) required = false;
            return verified;
          })
          .finally(() => {
            if (pending === request) pending = undefined;
          }),
      };
      pending = request;
      return request.promise;
    },
  };
}

export const operatorResumeGate = createOperatorResumeGate();
