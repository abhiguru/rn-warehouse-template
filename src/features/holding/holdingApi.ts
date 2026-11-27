/**
 * The holding list's server calls (WH-304, product/tech/app-offline-holding-list.md 11.5): the list of held items, one item with
 * its trial, and a decision. Every answer is read as a refusal or a success by the app's one rule (`classify`, after the empty
 * answer and the HTTP status are made part of the error); nothing here throws for a refusal, only for a call that did not get through.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { classify } from '@/features/unsent/sendEngine';
import { answerCodeOf, answerFiguresOf } from '@/features/unsent/refusalAnswer';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** A row of the list (`get_held_items`), and the head of one item (`get_held_item`). */
export interface HeldListRow {
  id: string;
  kind: string;
  /** `{ key, params }` as the phone handed it over. */
  what: unknown;
  customerName: string | null;
  recordedByName: string | null;
  recordedAt: string | null;
  phone: string | null;
  reason: string;
  reasonData: unknown;
  state: string;
  follows: string | null;
  needsDecision: boolean;
  canAccept: boolean;
  decidedByName: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  result: unknown;
}

/** What the server's value is for one changed field of a quick change or an edit (PQ6). */
export interface HeldCurrent {
  field: string;
  lineRef: string | null;
  current: unknown;
  held: unknown;
}

/** One photo of a held item: its file is under `held/<held id>/` in a photo bucket (role `dispatch`: dispatch-images, else grn-images). */
export interface HeldPhoto {
  clientPhotoId: string;
  role: string;
  /** Null for a photo the phone marked missing: there is no file. */
  path: string | null;
  /** True when the recorder's phone reported the file missing (state `missing`). */
  missing: boolean;
  /** `index:<n>` of a new GRN line, a lot id, or null (header and dispatch photos). */
  lineRef: string | null;
}

export interface HeldItemDetail extends HeldListRow {
  body: unknown;
  acceptedBody: unknown;
  acceptPossible: boolean;
  current: HeldCurrent[];
  /** The item's own confirmed photos. */
  photos: HeldPhoto[];
  /** The `photos` items that go with this one (their files are under their own held ids). */
  photoFollowers: string[];
}

/** A call that did not get through (no connection, a gateway answer, an answer that could not be read). */
export class HoldingCallError extends Error {
  constructor(readonly code: string | null) {
    super(code ?? 'the holding list could not be reached');
    this.name = 'HoldingCallError';
  }
}

export function listRowOf(raw: unknown): HeldListRow | null {
  if (!isFields(raw) || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    kind: textOf(raw.kind) ?? '',
    what: raw.what ?? null,
    customerName: textOf(raw.customer_name),
    recordedByName: textOf(raw.recorded_by_name),
    recordedAt: textOf(raw.recorded_at),
    phone: textOf(raw.phone),
    reason: textOf(raw.reason) ?? 'other',
    reasonData: raw.reason_data ?? null,
    state: textOf(raw.state) ?? 'held',
    follows: textOf(raw.follows),
    needsDecision: raw.needs_decision === true,
    canAccept: raw.can_accept === true,
    decidedByName: textOf(raw.decided_by_name),
    decidedAt: textOf(raw.decided_at),
    rejectReason: textOf(raw.reject_reason),
    result: raw.result ?? null,
  };
}

interface RpcAnswer {
  data: unknown;
  error: unknown;
  status?: number;
}

/** One call: the answer's members when the server succeeded, a refusal's code and answer, or a `HoldingCallError`. */
async function call(name: string, args: Fields): Promise<{ ok: true; data: Fields } | { ok: false; code: string | null; answer: Fields }> {
  let answer: RpcAnswer;
  try {
    const client = await getAuthenticatedClient();
    answer = (await client.rpc(name, args)) as RpcAnswer;
  } catch {
    throw new HoldingCallError(null);
  }
  const failure = answer.error ? withHttpStatus(answer.error, answer.status) : emptyAnswerAsError(answer);
  const outcome = classify(answer.data, failure);
  if (outcome.kind === 'sent' && isFields(outcome.result)) return { ok: true, data: outcome.result };
  if (outcome.kind === 'refused') return { ok: false, code: outcome.code ?? answerCodeOf(answer.data), answer: isFields(answer.data) ? answer.data : {} };
  throw new HoldingCallError(null);
}

/** Rows asked for at a time, and the most rows the list reads (contract 2.3: inside 2,000 rows). */
const PAGE = 200;
const MOST_ROWS = 2000;

/** The open held items, oldest first, each follower under its item. */
export async function getHeldItems(): Promise<HeldListRow[]> {
  const rows: HeldListRow[] = [];
  for (;;) {
    const answer = await call('get_held_items', { p_limit: PAGE, p_offset: rows.length });
    if (!answer.ok) throw new HoldingCallError(answer.code);
    const page = Array.isArray(answer.data.rows) ? answer.data.rows.flatMap(raw => listRowOf(raw) ?? []) : [];
    rows.push(...page);
    const total = typeof answer.data.total === 'number' ? answer.data.total : rows.length;
    if (page.length === 0 || rows.length >= total || rows.length >= MOST_ROWS) return rows;
  }
}

/** One item, with the trial of its Accept and, for a field change, the server's present values. */
export async function getHeldItem(id: string): Promise<HeldItemDetail> {
  const answer = await call('get_held_item', { p_id: id });
  if (!answer.ok) throw new HoldingCallError(answer.code);
  const head = listRowOf(answer.data);
  if (!head) throw new HoldingCallError(null);
  const current = Array.isArray(answer.data.current)
    ? answer.data.current.flatMap((entry: unknown) =>
        isFields(entry) && typeof entry.field === 'string'
          ? [{ field: entry.field, lineRef: textOf(entry.line_ref), current: entry.current, held: entry.held }]
          : [])
    : [];
  const photos = Array.isArray(answer.data.photos)
    ? answer.data.photos.flatMap((entry: unknown): HeldPhoto[] => {
        if (!isFields(entry) || (entry.state !== 'confirmed' && entry.state !== 'missing')) return [];
        const clientPhotoId = textOf(entry.client_photo_id);
        const path = textOf(entry.path);
        const missing = entry.state === 'missing';
        return clientPhotoId !== null && (missing || path !== null)
          ? [{ clientPhotoId, role: textOf(entry.role) ?? 'header', path: missing ? null : path, missing, lineRef: textOf(entry.line_ref) }]
          : [];
      })
    : [];
  const photoFollowers = Array.isArray(answer.data.followers)
    ? answer.data.followers.flatMap((entry: unknown): string[] => (isFields(entry) && entry.kind === 'photos' && typeof entry.id === 'string' ? [entry.id] : []))
    : [];
  return {
    ...head,
    body: answer.data.body ?? null,
    acceptedBody: answer.data.accepted_body ?? null,
    acceptPossible: answer.data.accept_possible === true,
    current,
    photos,
    photoFollowers,
  };
}

export type DecideInput =
  | { id: string; action: 'accept'; decisionKey: string; body?: unknown }
  | { id: string; action: 'reject'; decisionKey: string; reason: string };

export type DecideOutcome =
  | { kind: 'done'; state: 'accepted' | 'rejected'; result: unknown }
  | { kind: 'alreadyDecided'; state: 'accepted' | 'rejected'; decidedByName: string | null }
  /** The server refused the decision: Accept's own save refused, or the item is not decidable now. */
  | { kind: 'refused'; code: string | null; /** The refusal's figures (`reason_data`'s shape). */ data: unknown }
  | { kind: 'failed' };

/** Accepts or rejects an item. A plain Accept sends no `p_body` and no `p_reason`. */
export async function decideHeldItem(input: DecideInput): Promise<DecideOutcome> {
  const args: Fields = {
    p_id: input.id,
    p_action: input.action,
    p_decision_key: input.decisionKey,
    ...(input.action === 'reject' ? { p_reason: input.reason } : {}),
    ...(input.action === 'accept' && input.body !== undefined ? { p_body: input.body } : {}),
  };
  try {
    const answer = await call('decide_held_item', args);
    if (answer.ok) return { kind: 'done', state: answer.data.state === 'rejected' ? 'rejected' : 'accepted', result: answer.data.result ?? null };
    if (answer.code === 'HELD_ALREADY_DECIDED') {
      return { kind: 'alreadyDecided', state: answer.answer.state === 'rejected' ? 'rejected' : 'accepted', decidedByName: textOf(answer.answer.decided_by_name) };
    }
    return { kind: 'refused', code: answer.code, data: answerFiguresOf(answer.answer) };
  } catch {
    return { kind: 'failed' };
  }
}
