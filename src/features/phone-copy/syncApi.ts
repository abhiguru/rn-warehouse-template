/**
 * The four sync calls of the server (product/tech/server-change-log-feed.md section 3), through the authenticated
 * client so the identity gate, the warehouse network signer and the session checks apply (CG-62), and the checks of
 * every answer before it is used (CG-64; contract section 12).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { isEntityName, type EntityName } from './copySchema';

/** At most 2000 rows on every call (criterion 13). */
export const PAGE_LIMIT = 2000;
/** The same limit as every other read (REQUEST_TIME_LIMIT_MS.read). */
const READ_TIME_LIMIT_MS = 30_000;

/** The call got no usable answer: no connection, a timeout, a server error, or an answer that fails its checks. */
export class SyncFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncFailedError';
  }
}
/** The server has no such function (PGRST202): an older server, the feature is off. */
export class SyncUnsupportedError extends Error {
  constructor() {
    super('sync functions missing on the server');
    this.name = 'SyncUnsupportedError';
  }
}
/** The server ended the session (42501, "Session expired or revoked"): today's forced sign-out takes over. */
export class SyncSessionEndedError extends Error {
  constructor() {
    super('session ended');
    this.name = 'SyncSessionEndedError';
  }
}
/** The server refused with a reason of the feed (SYNC_BAD_POSITION, SYNC_BAD_COPY, SYNC_UNKNOWN_ENTITY, ...). */
export class SyncRefusedError extends Error {
  constructor(readonly reason: string) {
    super(`refused: ${reason}`);
    this.name = 'SyncRefusedError';
  }
}
/** The call was dropped because the engine stopped (background, erase, sign-out). */
export class SyncStoppedError extends Error {
  constructor() {
    super('stopped');
    this.name = 'SyncStoppedError';
  }
}

export interface FeedRow {
  id: string;
  v: string;
  row: Record<string, unknown>;
}
export interface SyncStart {
  format: number;
  copy: string;
  position: string;
  asOf: string;
  entities: string[];
}
export interface SyncPage {
  entity: EntityName;
  copy: string;
  rows: FeedRow[];
  nextAfter: string | null;
}
export type Change =
  | { e: EntityName; id: string; op: 'upsert'; v: string; row: Record<string, unknown> }
  | { e: EntityName; id: string; op: 'delete' }
  | { e: 'money'; id: string; op: 'stale' };
export interface SyncChanges {
  format: number | null;
  position: string;
  asOf: string;
  more: boolean;
  reloadAll: string | null;
  reload: EntityName[];
  changes: Change[];
}
export interface ChecksumEntry {
  e: string;
  count: number;
  sum: string;
  settled: boolean;
}
export interface SyncChecksums {
  reloadAll: string | null;
  entities: ChecksumEntry[];
}

const POSITION = /^[0-9]{1,20}$/;
const V = /^[0-9a-f]{16}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const bad = (what: string): never => {
  throw new SyncFailedError(`invalid answer: ${what}`);
};
const text = (value: unknown, what: string): string => (typeof value === 'string' && value ? value : bad(what));
const position = (value: unknown): string => (typeof value === 'string' && POSITION.test(value) ? value : bad('position'));
const entity = (value: unknown): EntityName => (isEntityName(value) ? value : bad('entity'));

function feedRow(value: unknown): FeedRow {
  if (!isObject(value)) return bad('row');
  const v = typeof value.v === 'string' && V.test(value.v) ? value.v : bad('v');
  if (!isObject(value.row)) return bad('row object');
  return { id: text(value.id, 'id'), v, row: value.row };
}

function change(value: unknown): Change {
  if (!isObject(value)) return bad('change');
  const id = text(value.id, 'id');
  if (value.op === 'stale') return value.e === 'money' ? { e: 'money', id, op: 'stale' } : bad('stale entity');
  const e = entity(value.e);
  if (value.op === 'delete') return { e, id, op: 'delete' };
  if (value.op !== 'upsert') return bad('op');
  const v = typeof value.v === 'string' && V.test(value.v) ? value.v : bad('v');
  if (!isObject(value.row)) return bad('row object');
  return { e, id, op: 'upsert', v, row: value.row };
}

function reloadAllReason(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return isObject(value) ? text(value.reason, 'reload_all reason') : bad('reload_all');
}

interface RpcAnswer {
  data: unknown;
  error: unknown;
}
interface RpcRequest extends PromiseLike<RpcAnswer> {
  abortSignal?: (signal: AbortSignal) => PromiseLike<RpcAnswer>;
}

/**
 * One call: dropped when `stop` fires, given up after the read limit. Answers the `data` of a `success: true` answer.
 */
async function call(name: string, args: Record<string, unknown>, stop: Promise<never>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let answer: RpcAnswer;
  try {
    const client = await Promise.race([getAuthenticatedClient(), stop]);
    const request = client.rpc(name, args) as unknown as RpcRequest;
    const pending = typeof request.abortSignal === 'function' ? request.abortSignal(controller.signal) : request;
    answer = await Promise.race([
      Promise.resolve(pending),
      stop,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SyncFailedError('timed out')), READ_TIME_LIMIT_MS);
      }),
    ]);
  } catch (error) {
    controller.abort();
    if (error instanceof SyncStoppedError || error instanceof SyncFailedError) throw error;
    throw new SyncFailedError('no answer');
  } finally {
    clearTimeout(timer);
  }
  const { data, error } = answer;
  if (error) {
    const fields = isObject(error) ? error : {};
    if (fields.code === 'PGRST202') throw new SyncUnsupportedError();
    const message = typeof fields.message === 'string' ? fields.message : '';
    if (fields.code === '42501' || /Session expired or revoked|Active account required/i.test(message)) throw new SyncSessionEndedError();
    throw new SyncFailedError('error answer');
  }
  if (!isObject(data)) return bad('not an object');
  if (data.success !== true) {
    if (typeof data.reason === 'string' && data.reason) throw new SyncRefusedError(data.reason);
    throw new SyncFailedError('refused');
  }
  return data;
}

export async function getSyncStart(stop: Promise<never>): Promise<SyncStart> {
  const data = await call('get_sync_start', {}, stop);
  if (typeof data.format !== 'number' || !Number.isInteger(data.format)) return bad('format');
  if (!Array.isArray(data.entities) || data.entities.some(e => typeof e !== 'string')) return bad('entities');
  return {
    format: data.format,
    copy: text(data.copy, 'copy'),
    position: position(data.position),
    asOf: text(data.as_of, 'as_of'),
    entities: data.entities as string[],
  };
}

export async function getSyncPage(name: EntityName, after: string | null, stop: Promise<never>): Promise<SyncPage> {
  const data = await call('get_sync_page', { p_entity: name, p_after: after, p_limit: PAGE_LIMIT }, stop);
  if (data.entity !== name) return bad('page entity');
  if (!Array.isArray(data.rows)) return bad('rows');
  const nextAfter = data.next_after === null || data.next_after === undefined ? null : text(data.next_after, 'next_after');
  return { entity: name, copy: text(data.copy, 'copy'), rows: data.rows.map(feedRow), nextAfter };
}

export async function getSyncChanges(from: string, copy: string, stop: Promise<never>): Promise<SyncChanges> {
  const data = await call('get_sync_changes', { p_position: from, p_copy: copy, p_limit: PAGE_LIMIT }, stop);
  const reloadAll = reloadAllReason(data.reload_all);
  const reload = data.reload === null || data.reload === undefined ? [] : Array.isArray(data.reload) ? data.reload.map(entity) : bad('reload');
  if (!Array.isArray(data.changes)) return bad('changes');
  return {
    format: typeof data.format === 'number' && Number.isInteger(data.format) ? data.format : null,
    position: position(data.position),
    asOf: text(data.as_of, 'as_of'),
    more: data.more === true,
    reloadAll,
    reload,
    changes: data.changes.map(change),
  };
}

export async function getSyncChecksums(at: string, copy: string, stop: Promise<never>): Promise<SyncChecksums> {
  const data = await call('get_sync_checksums', { p_position: at, p_copy: copy }, stop);
  const reloadAll = reloadAllReason(data.reload_all);
  const raw = data.entities ?? [];
  if (!Array.isArray(raw)) return bad('entities');
  const entities = raw.map((value: unknown): ChecksumEntry => {
    if (!isObject(value)) return bad('checksum');
    const sum = typeof value.sum === 'string' && /^[0-9]{1,20}$/.test(value.sum) ? value.sum : bad('sum');
    if (typeof value.count !== 'number' || !Number.isInteger(value.count)) return bad('count');
    return { e: text(value.e, 'e'), count: value.count, sum, settled: value.settled === true };
  });
  return { reloadAll, entities };
}
