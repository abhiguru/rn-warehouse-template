/**
 * The one decision, copy or server, for a read (WH-299, product/tech/app-offline-read-from-copy.md section 2). A service
 * asks `readVia` first; `null` means today's server path, unchanged. A screen has one source: a paged list whose source
 * changes between two pages is told to start again (section 2.2), so rows of the two never mix.
 */
import { hasCapability } from '@/config/facilityCapabilities';
import { isCopyRole } from '@/config/copyRoles';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger } from '@/utils/logger';
import { currentCopy } from './copyDb';
import { copyKindOf, signedInRole, storedCopyKind } from './copyKind';
import type { SqlValue } from './copyDriver';
import { COPY_FORMAT_V3, CUSTOMER_COPY_FORMAT, READ_FORMAT, type RankKind } from './copySchema';
import { ensureRanks } from './reads/textRank';
import { CopyReadError, type DataSource } from './sourced';
import { isCopyOffline } from './syncEngine';
import { getSyncSnapshot, type CopyPhase } from './syncStore';

const logger = createLogger('[phone-copy]');

/** What a read needs: only the first stage's records (GRNs, lots, customers, items, ...), or every record. */
export type CopyNeed = 'stage1' | 'all' | { stage: 'all'; format: number };

const needsStage1Only = (need: CopyNeed): boolean => need === 'stage1';

/** A read-only view of the open copy, one per `readVia` call; every statement sees the same records. */
export interface CopyReader {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** The first row, or null. */
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** Brings the en_US ranks of these texts up to date, for an ORDER BY over `text_rank`. */
  rank(kinds: readonly RankKind[]): Promise<void>;
  readonly asOf: string;
  readonly phase: CopyPhase;
  readonly copyId: string;
  /** The feed format of this copy: from 3 it carries the rates and invoice amounts (WH-348). */
  readonly format: number;
  /** The signed-in person's role: what the server's function would ask `warehouse_security.active_role()`. */
  readonly role: 'admin' | 'supervisor' | 'staff' | 'customer';
}

const FOR_CUSTOMER_ACCOUNTS = Symbol('forCustomerAccounts');

/**
 * Marks a reader as written for a customer account's copy (WH-306). A copy read by a customer account holds only its own
 * rows and none of the settings, people or lock tables the warehouse readers lean on, so `readVia` serves a customer
 * account from the copy only through a reader marked this way; every other read stays on the server for it.
 */
export function forCustomerAccounts<T extends (q: CopyReader) => unknown>(reader: T): T {
  return Object.assign(reader, { [FOR_CUSTOMER_ACCOUNTS]: true });
}
const isForCustomerAccounts = (reader: object): boolean => (reader as { [FOR_CUSTOMER_ACCOUNTS]?: boolean })[FOR_CUSTOMER_ACCOUNTS] === true;

export interface CopyAnswer<T> {
  value: T;
  source: DataSource;
}
/** A later page whose source is no longer the first page's: the list asks for its first page again. */
export interface CopyRestart {
  restart: true;
}
export interface PageChain {
  /** The request without its offset, limit or page number. */
  key: string;
  /** 0 for the first page. */
  page: number;
}

/** Where each paged request's first page came from. `fallback`: the copy failed to answer it. */
type ChainRecord = { source: 'copy'; copyId: string } | { source: 'server'; fallback: boolean };
const MAX_CHAINS = 16;
const chains = new Map<string, ChainRecord>();
registerSessionScoped('copy-read-chains', () => chains.clear());

function recordChain(key: string, record: ChainRecord): void {
  chains.delete(key);
  chains.set(key, record);
  for (const oldest of chains.keys()) {
    if (chains.size <= MAX_CHAINS) break;
    chains.delete(oldest);
  }
}

/**
 * A role with a copy, on a facility with the feature, over a copy loaded for that kind of role (a warehouse copy holds
 * every customer's rows and is never read by a customer account, WH-306) and not of an older format. A copy that has
 * not begun its first load (no format yet) is eligible: what it holds is a question of its phase.
 */
export function copyEligible(): boolean {
  if (!hasCapability('sync')) return false;
  const role = signedInRole();
  if (!isCopyRole(role)) return false;
  const { feature, format, kind } = getSyncSnapshot();
  if (feature === 'off') return false;
  if (kind !== undefined && kind !== copyKindOf(role)) return false;
  const oldest = copyKindOf(role) === 'customer' ? CUSTOMER_COPY_FORMAT : READ_FORMAT;
  return format === undefined || format >= oldest;
}

/**
 * 'copy' only for a warehouse role, on a facility with the feature, over a copy of format 2 that is complete, or that
 * holds what the read needs while the phone is offline and the older records have not arrived.
 */
export function copyRoute(need: CopyNeed): 'copy' | 'server' {
  if (!copyEligible()) return 'server';
  const { phase, format } = getSyncSnapshot();
  if (format === undefined) return 'server';
  // A read that needs a newer format stays on the server over an older copy (WH-348, contract section 2).
  if (typeof need === 'object' && format < need.format) return 'server';
  if (phase === 'ready') return 'copy';
  return phase === 'stage2' && needsStage1Only(need) && isCopyOffline() ? 'copy' : 'server';
}

/** True when the copy in use is of format 3 or newer: the rates and invoice amounts are on the phone (WH-348). */
export function copyCarriesFormat3(): boolean {
  return (getSyncSnapshot().format ?? 0) >= COPY_FORMAT_V3;
}

const copyRoleOf = (role: unknown): CopyReader['role'] | null =>
  role === 'admin' || role === 'supervisor' || role === 'staff' || role === 'customer' ? role : null;

const isPhase = (value: string | undefined): value is CopyPhase =>
  value === 'empty' || value === 'stage1' || value === 'stage2' || value === 'ready';

/** Runs `fromCopy` over this session's copy in one transaction, so no sync write falls between its statements. */
async function readCopy<T>(need: CopyNeed, fromCopy: (q: CopyReader) => Promise<T>): Promise<{ answer: CopyAnswer<T>; copyId: string }> {
  const scope = await getSessionCacheScope();
  const db = currentCopy();
  const role = copyRoleOf(signedInRole());
  if (!db || !scope || !role) throw new CopyReadError();
  let result: { answer: CopyAnswer<T>; copyId: string } | null = null;
  await db.transaction(async tx => {
    const rows = await tx.all<{ k: string; v: string }>("SELECT k, v FROM meta WHERE k IN ('scope', 'copy', 'phase', 'as_of', 'kind', 'format')");
    const meta = new Map(rows.map(r => [r.k, r.v]));
    const phase = meta.get('phase');
    const copyId = meta.get('copy');
    const asOf = meta.get('as_of');
    // The copy may have been replaced since the route was decided.
    const holds = phase === 'ready' || (needsStage1Only(need) && phase === 'stage2');
    if (meta.get('scope') !== scope || !copyId || !asOf || !isPhase(phase) || !holds) throw new CopyReadError();
    // Only the kind of role the copy was loaded for reads it (WH-306).
    if (storedCopyKind(meta.get('kind'), meta.has('format')) !== copyKindOf(role)) throw new CopyReadError();
    const reader: CopyReader = {
      all: (sql, params) => tx.all(sql, params),
      get: async <R,>(sql: string, params?: SqlValue[]) => (await tx.all<R>(sql, params))[0] ?? null,
      rank: kinds => ensureRanks(tx, kinds),
      asOf,
      phase,
      copyId,
      format: getSyncSnapshot().format ?? 0,
      role,
    };
    result = { answer: { value: await fromCopy(reader), source: { kind: 'copy', asOf } }, copyId };
  });
  if (!result) throw new CopyReadError();
  return result;
}

/**
 * A read that has no server path (Find goods, WH-300): the copy in its second stage or complete, whatever the
 * connection. `not-ready`: no copy of this session, or one that does not hold the records yet when the transaction
 * starts. `failed`: any other error, logged once by its name.
 */
export async function readCopyOnly<T>(
  fromCopy: (q: CopyReader) => Promise<T>
): Promise<{ kind: 'answer'; answer: CopyAnswer<T> } | { kind: 'not-ready' } | { kind: 'failed' }> {
  try {
    return { kind: 'answer', answer: (await readCopy('stage1', fromCopy)).answer };
  } catch (error) {
    if (error instanceof CopyReadError) return { kind: 'not-ready' };
    // The error's name only: a database message can quote a row.
    logger.warn('A read of the copy without a server path failed', error instanceof Error ? error.name : 'unknown');
    return { kind: 'failed' };
  }
}

export function readVia<T>(need: CopyNeed, fromCopy: (q: CopyReader) => Promise<T>): Promise<CopyAnswer<T> | null>;
export function readVia<T>(
  need: CopyNeed,
  fromCopy: (q: CopyReader) => Promise<T>,
  chain: PageChain
): Promise<CopyAnswer<T> | CopyRestart | null>;
export async function readVia<T>(
  need: CopyNeed,
  fromCopy: (q: CopyReader) => Promise<T>,
  chain?: PageChain
): Promise<CopyAnswer<T> | CopyRestart | null> {
  const decided = copyRoute(need);
  // A customer account's copy is read only by the readers written for it.
  const route = decided === 'copy' && signedInRole() === 'customer' && !isForCustomerAccounts(fromCopy) ? 'server' : decided;
  const later = chain !== undefined && chain.page > 0;
  const first = later ? chains.get(chain.key) : undefined;
  if (first?.source === 'copy' && route === 'server') return { restart: true };
  if (first?.source === 'server' && route === 'copy') {
    // A first page the copy failed to answer is followed by the server's next pages, not by another restart.
    return first.fallback ? null : { restart: true };
  }
  if (route === 'server') {
    if (chain && !later) recordChain(chain.key, { source: 'server', fallback: false });
    return null;
  }
  try {
    const { answer, copyId } = await readCopy(need, fromCopy);
    if (first?.source === 'copy' && first.copyId !== copyId) return { restart: true };
    if (chain && !later) recordChain(chain.key, { source: 'copy', copyId });
    return answer;
  } catch (error) {
    // The error's name only: a database message can quote a row.
    logger.warn('A read of the copy failed', error instanceof Error ? error.name : 'unknown');
    // A later page never falls to the server: rows of the copy are on screen.
    if (later) return { restart: true };
    if (chain) recordChain(chain.key, { source: 'server', fallback: true });
    return null;
  }
}
