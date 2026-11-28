/**
 * The kinds of item the queue can send (WH-301, product/tech/app-offline-unsent-work.md section 2.1). WH-301 registers
 * `photos`; WH-302 (quick change), WH-303 (edit GRN) and WH-161 (new GRN, new dispatch) register their own.
 */
import type { ItemState } from './unsentRows';

export type SendOutcome =
  | { kind: 'sent'; result: unknown }
  /**
   * `answer`: the server's whole refusal as it came, kept in the item's result so a screen can show its figures (WH-303) and the
   * form that waits for the item gives it to today's refusal alert (WH-161).
   */
  | { kind: 'refused'; reason: string; code?: string; answer?: unknown }
  | { kind: 'lost' }
  | { kind: 'transient' }
  /** The session ended or was refused (401): the pass ends. */
  | { kind: 'stop' };

export interface SendContext {
  /** The queue item being sent (a kind with files reads its rows). */
  itemId: string;
  /** The item's permanent request ID; the same on every resend. */
  requestKey: string;
  /** The `result` of each item this one depended on, by that item's id. */
  resolved: Record<string, unknown>;
  /**
   * Told when the server accepted a change that may not end in a `sent` item (WH-393: some photos of an item), so the pass
   * still asks for its sync. Only for a change the next pass does not make again, or the sync and the pass would repeat each
   * other without a wait.
   */
  noteWrite?: () => void;
}

export interface SendKind {
  send(body: never, ctx: SendContext): Promise<SendOutcome>;
  /** What an answer means for this kind, when it is not `classify`'s (WH-161: a flat result); also used on a stored answer after a lost one. */
  outcomeOf?(answer: unknown): SendOutcome;
  /** What the item changes on screen, for the readers' overlay (a later slice). */
  overlay?(body: never, state: ItemState, item?: { id: string; recordedAt: number; result: unknown }): unknown;
  /** `record` kinds go strictly in order, one at a time; `photo` kinds go after their record and never hold it. */
  lane: 'record' | 'photo';
}

function createRegistry() {
  const kinds = new Map<string, SendKind>();
  return {
    register: (name: string, kind: SendKind): void => {
      kinds.set(name, kind);
    },
    get: (name: string): SendKind | undefined => kinds.get(name),
  };
}
const registry = createRegistry();

/** Registers (or replaces) the kind named `name`. */
export const registerSendKind = registry.register;
export const getSendKind = registry.get;
