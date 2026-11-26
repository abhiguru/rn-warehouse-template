/**
 * The one decision, copy or server, for a read (WH-299, product/tech/app-offline-read-from-copy.md section 2). A service
 * asks `readVia` first; `null` means today's server path, unchanged. A screen has one source: a paged list whose source
 * changes between two pages is told to start again (section 2.2), so rows of the two never mix.
 */
import { hasCapability } from '@/config/facilityCapabilities';
import { isCopyRole } from '@/config/offlineStart';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger } from '@/utils/logger';
import { currentCopy } from './copyDb';
import type { SqlValue } from './copyDriver';
import { READ_FORMAT, type RankKind } from './copySchema';
import { ensureRanks } from './reads/textRank';
import { CopyReadError, type DataSource } from './sourced';
import { isCopyOffline } from './syncEngine';
import { getSyncSnapshot, type CopyPhase } from './syncStore';

const logger = createLogger('[phone-copy]');

/** What a read needs: only the first stage's records (GRNs, lots, customers, items, ...), or every record. */
export type CopyNeed = 'stage1' | 'all';

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
  /** The signed-in person's role: what the server's function would ask `warehouse_security.active_role()`. */
  readonly role: 'admin' | 'supervisor' | 'staff';
}

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
 * The signed-in person's role. The store is loaded when first asked: the services that read through this route would
 * otherwise bring the whole store, and its screens' hooks, into everything that imports them.
 */
function signedInRole(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- loaded when first asked, see above
  const { store } = require('@/store') as typeof import('@/store');
  return store.getState().auth.userProfile?.role;
}

/**
 * 'copy' only for a warehouse role, on a facility with the feature, over a copy of format 2 that is complete, or that
 * holds what the read needs while the phone is offline and the older records have not arrived.
 */
export function copyRoute(need: CopyNeed): 'copy' | 'server' {
  if (!hasCapability('sync') || !isCopyRole(signedInRole())) return 'server';
  const { feature, phase, format } = getSyncSnapshot();
  if (feature === 'off' || format === undefined || format < READ_FORMAT) return 'server';
  if (phase === 'ready') return 'copy';
  return phase === 'stage2' && need === 'stage1' && isCopyOffline() ? 'copy' : 'server';
}

const copyRoleOf = (role: unknown): CopyReader['role'] | null =>
  role === 'admin' || role === 'supervisor' || role === 'staff' ? role : null;

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
    const rows = await tx.all<{ k: string; v: string }>("SELECT k, v FROM meta WHERE k IN ('scope', 'copy', 'phase', 'as_of')");
    const meta = new Map(rows.map(r => [r.k, r.v]));
    const phase = meta.get('phase');
    const copyId = meta.get('copy');
    const asOf = meta.get('as_of');
    // The copy may have been replaced since the route was decided.
    const holds = phase === 'ready' || (need === 'stage1' && phase === 'stage2');
    if (meta.get('scope') !== scope || !copyId || !asOf || !isPhase(phase) || !holds) throw new CopyReadError();
    const reader: CopyReader = {
      all: (sql, params) => tx.all(sql, params),
      get: async <R,>(sql: string, params?: SqlValue[]) => (await tx.all<R>(sql, params))[0] ?? null,
      rank: kinds => ensureRanks(tx, kinds),
      asOf,
      phase,
      copyId,
      role,
    };
    result = { answer: { value: await fromCopy(reader), source: { kind: 'copy', asOf } }, copyId };
  });
  if (!result) throw new CopyReadError();
  return result;
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
  const route = copyRoute(need);
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
