/**
 * The kinds of item the queue can send (WH-301, product/tech/app-offline-unsent-work.md section 2.1). WH-301 registers
 * `photos`; WH-302 (quick change), WH-303 (edit GRN) and WH-161 (new GRN, new dispatch) register their own.
 */
import type { ItemState } from './unsentRows';

export type SendOutcome =
  | { kind: 'sent'; result: unknown }
  /** `answer` is the whole refusal the server sent, kept in the item's result so a screen can show its figures. */
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
}

export interface SendKind {
  send(body: never, ctx: SendContext): Promise<SendOutcome>;
  /** What the item changes on screen, for the readers' overlay (a later slice). */
  overlay?(body: never, state: ItemState): unknown;
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
