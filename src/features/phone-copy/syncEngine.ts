/**
 * The sync engine of the phone copy (WH-298, product/tech/app-offline-copy-and-sync.md section 6): the first load in
 * one pass, the changes, the server-ordered reloads, the daily comparison, one run at a time, and the schedule that
 * PhoneCopyLifecycle switches on. Never in the background. Every page is stored in one local transaction with its
 * position or cursor, so a kill resumes and nothing shows half a page.
 *
 * Each run belongs to one session (its scope) and one engine epoch: before every local transaction it checks both, and
 * stops without writing when either changed (sign-out, another person, background, erase). A token refresh changes
 * neither.
 */
import NetInfo from '@react-native-community/netinfo';
import { getLanStatus } from '@/config/lanTransport';
import { isOfflineState } from '@/config/netOffline';
import { hasCapability } from '@/config/facilityCapabilities';
import { noteRpcSupport } from '@/config/facilityRpcSupport';
import { captureMessage } from '@/config/sentryConfig';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger, loggableError } from '@/utils/logger';
import { applyChanges, finishReload, stageRows, writeRows } from './applyBatch';
import { compareChecksums } from './checksums';
import { forgetCopyChanges, noteCopyChange, publishCopyChanges } from './copyChanges';
import { copyKindOf, signedInRole, storedCopyKind } from './copyKind';
import { CopyKeyUnreadableError, eraseCopyFiles, openCopy, replaceWithEmptyCopy, setBeforeErase } from './copyDb';
import type { CopyDriver } from './copyDriver';
import { recordCopyKeyReadTry, resetCopyKeyReadTries } from './copyKeyReadTries';
import {
  ALL_ENTITIES, CUSTOMER_COPY_FORMAT, SYNC_FORMATS, createIndexes, isEntityName, rebuildAllSearch, type EntityName,
} from './copySchema';
import { isDiskFull, isSpaceShort, readCopyStorage } from './copyStorage';
import {
  SyncFailedError, SyncRefusedError, SyncSessionEndedError, SyncStoppedError, SyncUnsupportedError, getSyncChanges,
  getSyncChecksums, getSyncPage, getSyncStart, type SyncPage,
} from './syncApi';
import { getSyncSnapshot, resetSyncSnapshot, updateSyncSnapshot, type CopyPhase, type SyncSnapshot } from './syncStore';

export type SyncTrigger = 'open' | 'foreground' | 'reconnect' | 'interval' | 'pull-to-refresh' | 'after-send' | 'retry' | 'checksum' | 'orders';
export type SyncOutcome = 'done' | 'offline' | 'failed' | 'busy-queued' | 'off' | 'stopped';

const logger = createLogger('[phone-copy]');

/** A copy is current for this long after a full sync (spec "current"). */
const CURRENT_MS = 60_000;
/** The next sync after a full one: inside the minute, so the bar does not flicker (contract 6.6). */
const INTERVAL_MS = 45_000;
/** Waits after failed runs while the server is reachable. */
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Reasons whose old copy is still true as of its time (Product's P1): kept readable until the new one is complete. */
const KEEP_OLD_REASONS: readonly string[] = ['BULK_IMPORT', 'LOG_PURGED'];
/** Refusals of the changes call that mean "load everything again". */
const RELOAD_REFUSALS: readonly string[] = ['SYNC_BAD_POSITION', 'SYNC_BAD_COPY'];

/** The server's format or entity list is not this app's: the feature is off. */
class FeatureOffError extends Error {}
/** Access changed during a first load: its rows are dropped and it starts again at get_sync_start. */
class RestartLoadError extends Error {}
/** The server ordered a reload of everything. */
class ReloadAllError extends Error {
  constructor(readonly reason: string) {
    super(`reload_all ${reason}`);
  }
}

interface Cursor {
  entity: EntityName;
  after: string | null;
}
interface PendingReload {
  whole: boolean;
  entities: EntityName[];
  position: string;
  cursor: Cursor | null;
  /** A whole reload: what the new copy is. */
  copy?: string;
  format?: number;
  asOf?: string;
}
interface Run {
  epoch: number;
  scope: string;
  stop: Promise<never>;
  db: CopyDriver;
  /** A reload of everything already happened in this run: no comparison after it. */
  reloadedAll: boolean;
}

function makeStop() {
  let fire: () => void = () => undefined;
  const promise = new Promise<never>((_, reject) => {
    fire = () => reject(new SyncStoppedError());
  });
  promise.catch(() => undefined);
  return { promise, fire };
}

/** Timers of the engine never keep a process alive on their own (a test runner); the phone's timers have no unref. */
function later(ms: number, task: () => void): ReturnType<typeof setTimeout> {
  const timer = setTimeout(task, ms);
  (timer as unknown as { unref?: () => void }).unref?.();
  return timer;
}

const engine = {
  started: false,
  /** The server ended the session: nothing runs until the session is set up again. */
  halted: false,
  epoch: 0,
  stop: makeStop(),
  run: null as Promise<SyncOutcome> | null,
  again: false,
  schedule: false,
  foreground: true,
  offline: false,
  /** Screens that follow the connection; each removes itself on unmount. */
  offlineListeners: new Set<() => void>(),
  /** Listeners told when a sync run ended well (the unsent work is sent again then). */
  runEndListeners: new Set<() => void | Promise<void>>(),
  backoff: 0,
  timer: null as ReturnType<typeof setTimeout> | null,
  currentTimer: null as ReturnType<typeof setTimeout> | null,
  /** The same local write failed this many runs in a row (contract 6.5): at three the copy is loaded again. */
  writeFailures: 0,
};

// ---------- meta ----------

async function meta(db: CopyDriver, key: string): Promise<string | null> {
  const rows = await db.all<{ v: string }>('SELECT v FROM meta WHERE k = ?', [key]);
  return rows[0]?.v ?? null;
}
const setMeta = (tx: CopyDriver, key: string, value: string) =>
  tx.run('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', [key, value]);
const deleteMeta = (tx: CopyDriver, key: string) => tx.run('DELETE FROM meta WHERE k = ?', [key]);

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
const isPhase = (value: string | null): value is CopyPhase =>
  value === 'empty' || value === 'stage1' || value === 'ready';
const phaseOf = async (db: CopyDriver): Promise<CopyPhase> => {
  const value = await meta(db, 'phase');
  return isPhase(value) ? value : 'empty';
};
const entityList = (raw: string | null): EntityName[] => (parseJson<unknown[]>(raw) ?? []).filter(isEntityName);

// ---------- run guard ----------

async function guard(run: Run): Promise<void> {
  if (run.epoch !== engine.epoch) throw new SyncStoppedError();
  const scope = await getSessionCacheScope();
  if (run.epoch !== engine.epoch) throw new SyncStoppedError();
  // Not read is not another session: nothing is written now, and the run is tried again (WH-355).
  if (!scope) throw new SyncFailedError('session not read');
  if (scope !== run.scope) throw new SyncStoppedError();
}

/** One local transaction of this run, after the guard. */
async function write(run: Run, work: (tx: CopyDriver) => Promise<void>): Promise<void> {
  await guard(run);
  await run.db.transaction(work);
}

// ---------- published state ----------

function publish(patch: Partial<SyncSnapshot>): void {
  // The first real state ends a failed open; until then the bar keeps saying so.
  const endsFailedOpen = patch.pending === false && getSyncSnapshot().openFailed === true;
  updateSyncSnapshot(endsFailedOpen ? { ...patch, openFailed: false } : patch);
}

/** An attempt to open the copy failed while the bar still waits for it (Design 1.5). */
function noteOpenFailed(epoch: number): void {
  if (epoch === engine.epoch && getSyncSnapshot().pending) publish({ openFailed: true });
}

/**
 * The copy's file or key failed this attempt. Nothing is counted and nothing erased for it, online or offline, however
 * long it lasts (WH-355, WH-364): only copyDb erases, for a file SQLite proved unreadable with a key that was read.
 */
function noteOpenError(epoch: number, error: unknown): void {
  if (epoch === engine.epoch && isDiskFull(error)) publish({ storageLow: true });
}

function setCurrent(on: boolean): void {
  if (engine.currentTimer) clearTimeout(engine.currentTimer);
  engine.currentTimer = null;
  if (on) {
    engine.currentTimer = later(CURRENT_MS, () => {
      engine.currentTimer = null;
      publish({ current: false });
    });
  }
  publish({ current: on });
}

/** Reads size and free space; low storage follows free space (a failed write sets it on its own). */
function noteStorage(db: CopyDriver, writeWorked: boolean): void {
  const { copyBytes, freeBytes } = readCopyStorage(db.path);
  const patch: Partial<SyncSnapshot> = { copyBytes, freeBytes };
  if (isSpaceShort(freeBytes)) patch.storageLow = true;
  else if (writeWorked) patch.storageLow = false;
  publish(patch);
}

/** Enough of the copy is on the phone to be read: all of it (the first load is one pass, WH-381). */
const isReadablePhase = (phase: CopyPhase): boolean => phase === 'ready';

/**
 * What the open copy holds. A readable copy, or any copy without a connection, is the bar's state at once; otherwise
 * a load is about to run, and the bar waits for it (never "not ready" for the moment before it begins).
 */
async function publishFromMeta(db: CopyDriver, offline: boolean): Promise<void> {
  const phase = await phaseOf(db);
  const format = Number(await meta(db, 'format'));
  const kind = storedCopyKind(await meta(db, 'kind'), format > 0);
  const patch: Partial<SyncSnapshot> = { phase, asOf: await meta(db, 'as_of'), format: format || undefined, kind, copyOpen: true };
  if (phase !== 'empty' && SYNC_FORMATS.includes(format) && getSyncSnapshot().feature !== 'off') patch.feature = 'on';
  if (isReadablePhase(phase) || offline) patch.pending = false;
  publish(patch);
  noteStorage(db, false);
}

// ---------- first load (contract 6.2) ----------

/** Empties the copy's data, keeping its file, key, schema and scope. */
async function clearData(tx: CopyDriver): Promise<void> {
  for (const entity of ALL_ENTITIES) await tx.run(`DELETE FROM ${entity}`);
  await tx.exec('DELETE FROM lot_search; DELETE FROM text_rank; DELETE FROM stage_rows; DELETE FROM money_stale; DELETE FROM money_answers;');
  await tx.run("DELETE FROM meta WHERE k NOT IN ('schema_version', 'scope')");
  await setMeta(tx, 'phase', 'empty');
}

/**
 * The copy this session's role may keep reads a format this app knows; a customer account's copy only from
 * `CUSTOMER_COPY_FORMAT` (formats 4 to 6 are read for the warehouse roles only).
 */
function readableFormat(format: number): boolean {
  if (!SYNC_FORMATS.includes(format)) return false;
  return copyKindOf(signedInRole()) !== 'customer' || format >= CUSTOMER_COPY_FORMAT;
}
const readableStart = (start: { format: number }): boolean => readableFormat(start.format);

async function startLoad(run: Run): Promise<void> {
  const kind = copyKindOf(signedInRole());
  // No known role, no copy: a copy is stored for the kind that loaded it, and a guess could keep a warehouse copy for a customer.
  // The run fails before anything is written and is tried again once the profile is known.
  if (!kind) throw new SyncFailedError('role not known');
  // A customer account's copy is for a facility that says it has the feature (contract 11 O3): no copy file otherwise.
  if (kind === 'customer' && !hasCapability('sync')) throw new FeatureOffError();
  const start = await getSyncStart(run.stop);
  if (!readableStart(start) || !start.entities.every(isEntityName)) throw new FeatureOffError();
  // A name listed twice would send the page cursor round in a circle: each entity is loaded once, at its first place.
  const entities: EntityName[] = [...new Set(start.entities)];
  await write(run, async tx => {
    await clearData(tx);
    await setMeta(tx, 'format', String(start.format));
    await setMeta(tx, 'kind', kind);
    await setMeta(tx, 'copy', start.copy);
    await setMeta(tx, 'start_position', start.position);
    await setMeta(tx, 'as_of', start.asOf);
    await setMeta(tx, 'entities', JSON.stringify(entities));
    await setMeta(tx, 'phase', 'stage1');
    if (entities.length) await setMeta(tx, 'load_cursor', JSON.stringify({ entity: entities[0], after: null }));
  });
  publish({ feature: 'on', phase: 'stage1', asOf: start.asOf, format: start.format, kind });
}

async function fetchPage(run: Run, cursor: Cursor): Promise<SyncPage> {
  try {
    return await getSyncPage(cursor.entity, cursor.after, run.stop);
  } catch (error) {
    if (error instanceof SyncRefusedError && error.reason === 'SYNC_UNKNOWN_ENTITY') throw new RestartLoadError();
    throw error;
  }
}

async function firstLoad(run: Run): Promise<void> {
  publish({ running: 'first-load', pending: false });
  if ((await phaseOf(run.db)) === 'empty') await startLoad(run);
  const db = run.db;
  const entities = entityList(await meta(db, 'entities'));
  const copy = await meta(db, 'copy');
  let cursor = parseJson<Cursor>(await meta(db, 'load_cursor'));
  const nextOf = (entity: EntityName, nextAfter: string | null): Cursor | null => {
    if (nextAfter) return { entity, after: nextAfter };
    const index = entities.indexOf(entity);
    return index >= 0 && index + 1 < entities.length ? { entity: entities[index + 1], after: null } : null;
  };
  let pending = cursor ? fetchPage(run, cursor) : null;
  while (cursor && pending) {
    const page = await pending;
    if (page.copy !== copy) throw new RestartLoadError();
    const next = nextOf(cursor.entity, page.nextAfter);
    // The next page is asked for while this one is written.
    pending = next ? fetchPage(run, next) : null;
    pending?.catch(() => undefined);
    const entity = cursor.entity;
    await write(run, async tx => {
      await writeRows(tx, entity, page.rows);
      if (next) await setMeta(tx, 'load_cursor', JSON.stringify(next));
      else await deleteMeta(tx, 'load_cursor');
    });
    cursor = next;
  }
  const startPosition = await meta(db, 'start_position');
  await write(run, async tx => {
    // The phone is usable from here: the indexes, the lot search table and its index, and the phase move together.
    await createIndexes(tx, entities);
    await rebuildAllSearch(tx);
    await setMeta(tx, 'phase', 'ready');
    await deleteMeta(tx, 'load_cursor');
    if (startPosition) await setMeta(tx, 'position', startPosition);
    await deleteMeta(tx, 'start_position');
  });
  publish({ phase: 'ready' });
  noteCopyChange(entities);
  noteStorage(db, true);
}

// ---------- reloads (contract 6.4) ----------

async function runReload(run: Run, pending: PendingReload): Promise<void> {
  publish({ running: 'reload' });
  const copy = pending.whole ? pending.copy : await meta(run.db, 'copy');
  let cursor = pending.cursor;
  while (cursor) {
    const page = await getSyncPage(cursor.entity, cursor.after, run.stop);
    if (page.copy !== copy) throw new ReloadAllError('ACCESS_CHANGED');
    const index = pending.entities.indexOf(cursor.entity);
    const next: Cursor | null = page.nextAfter
      ? { entity: cursor.entity, after: page.nextAfter }
      : index + 1 < pending.entities.length ? { entity: pending.entities[index + 1], after: null } : null;
    const entity = cursor.entity;
    await write(run, async tx => {
      await stageRows(tx, entity, page.rows);
      await setMeta(tx, 'pending_reload', JSON.stringify({ ...pending, cursor: next }));
    });
    cursor = next;
  }
  await write(run, async tx => {
    await finishReload(tx, pending.entities, pending.whole);
    if (pending.whole) {
      if (pending.copy) await setMeta(tx, 'copy', pending.copy);
      if (pending.format !== undefined) await setMeta(tx, 'format', String(pending.format));
      if (pending.asOf) await setMeta(tx, 'as_of', pending.asOf);
      await setMeta(tx, 'entities', JSON.stringify(pending.entities));
    }
    await setMeta(tx, 'position', pending.position);
    await deleteMeta(tx, 'pending_reload');
  });
  noteCopyChange(pending.entities);
  if (pending.whole && pending.asOf) publish({ asOf: pending.asOf, format: pending.format });
}

async function beginReload(run: Run, entities: EntityName[], position: string): Promise<void> {
  const pending: PendingReload = { whole: false, entities, position, cursor: entities.length ? { entity: entities[0], after: null } : null };
  await write(run, async tx => {
    await tx.run('DELETE FROM stage_rows');
    await setMeta(tx, 'pending_reload', JSON.stringify(pending));
  });
  await runReload(run, pending);
}

/** A reload of everything: kept readable meanwhile, or erased first (Product's P1). */
async function reloadAll(run: Run, reason: string): Promise<void> {
  logger.info(`Reload of the whole copy ordered: ${reason}`);
  run.reloadedAll = true;
  const { freeBytes } = readCopyStorage(run.db.path);
  if (KEEP_OLD_REASONS.includes(reason) && !isSpaceShort(freeBytes) && (await phaseOf(run.db)) === 'ready') {
    publish({ running: 'reload' });
    const start = await getSyncStart(run.stop);
    if (!readableStart(start) || !start.entities.every(isEntityName)) throw new FeatureOffError();
    const entities: EntityName[] = [...new Set(start.entities)];
    const pending: PendingReload = {
      whole: true, entities, position: start.position, copy: start.copy, format: start.format, asOf: start.asOf,
      cursor: entities.length ? { entity: entities[0], after: null } : null,
    };
    await write(run, async tx => {
      await tx.run('DELETE FROM stage_rows');
      await setMeta(tx, 'pending_reload', JSON.stringify(pending));
    });
    await runReload(run, pending);
    return;
  }
  await guard(run);
  run.db = await replaceWithEmptyCopy(run.scope);
  publish({ phase: 'empty', asOf: null, current: false });
}

// ---------- changes (contract 6.3) ----------

async function catchUp(run: Run): Promise<void> {
  publish({ running: 'changes' });
  for (;;) {
    const position = await meta(run.db, 'position');
    const copy = await meta(run.db, 'copy');
    if (!position || !copy) throw new ReloadAllError('POSITION_AHEAD');
    let answer;
    try {
      answer = await getSyncChanges(position, copy, run.stop);
    } catch (error) {
      if (error instanceof SyncRefusedError && RELOAD_REFUSALS.includes(error.reason)) {
        logger.warn(`Changes refused (${error.reason}): the copy is loaded again`);
        throw new ReloadAllError(error.reason);
      }
      throw error;
    }
    if (answer.reloadAll) {
      if (answer.reloadAll === 'FORMAT_CHANGED' && answer.format !== null && !readableFormat(answer.format)) throw new FeatureOffError();
      throw new ReloadAllError(answer.reloadAll);
    }
    if (answer.reload.length) {
      await beginReload(run, answer.reload, answer.position);
      publish({ running: 'changes' });
      continue;
    }
    const page = answer;
    let touched: ReadonlySet<EntityName> = new Set<EntityName>();
    await write(run, async tx => {
      touched = await applyChanges(tx, page.changes, true);
      await setMeta(tx, 'position', page.position);
      await setMeta(tx, 'as_of', page.asOf);
    });
    noteCopyChange(touched);
    publish({ asOf: page.asOf });
    if (!page.more) return;
  }
}

// ---------- daily comparison (contract 6.7) ----------

async function compareIfDue(run: Run): Promise<void> {
  if (run.reloadedAll) return;
  const now = Date.now();
  const at = Number(await meta(run.db, 'checksum_at')) || null;
  const partial = Number(await meta(run.db, 'checksum_partial_at')) || null;
  const due = partial !== null
    ? now - partial >= HOUR_MS || partial > now
    : at === null || now - at > DAY_MS || at > now;
  if (!due) return;
  const position = await meta(run.db, 'position');
  const copy = await meta(run.db, 'copy');
  if (!position || !copy) return;
  publish({ running: 'checksums' });
  let answer;
  try {
    answer = await getSyncChecksums(position, copy, run.stop);
  } catch (error) {
    if (error instanceof SyncFailedError || error instanceof SyncRefusedError) {
      logger.info('The daily comparison got no answer; it is tried after the next full sync');
      return;
    }
    throw error;
  }
  if (answer.reloadAll) throw new ReloadAllError(answer.reloadAll);
  const result = await compareChecksums(run.db, answer.entities);
  for (const m of result.mismatched) {
    logger.warn(`Checksum mismatch on ${m.entity}: phone ${m.phoneCount}, server ${m.serverCount}; reloading it`);
    captureMessage(`sync_checksum_mismatch ${m.entity} phone=${m.phoneCount} server=${m.serverCount}`, 'warning');
  }
  await write(run, async tx => {
    if (result.unsettled) await setMeta(tx, 'checksum_partial_at', String(now));
    else {
      await setMeta(tx, 'checksum_at', String(now));
      await deleteMeta(tx, 'checksum_partial_at');
    }
  });
  if (result.mismatched.length) await beginReload(run, result.mismatched.map(m => m.entity), position);
}

// ---------- one run ----------

async function work(run: Run): Promise<void> {
  if (engine.writeFailures >= 3) {
    // The same local write failed three runs in a row: the copy is loaded again from nothing.
    engine.writeFailures = 0;
    await guard(run);
    run.db = await replaceWithEmptyCopy(run.scope);
    // Said together with the load that follows, so the bar never reads "not ready" in between.
    publish({ phase: 'empty', asOf: null, current: false, running: 'first-load', pending: false });
  }
  for (let round = 0; ; round += 1) {
    if (round >= 4) throw new SyncFailedError('too many restarts');
    try {
      if ((await phaseOf(run.db)) !== 'ready') await firstLoad(run);
      const pending = parseJson<PendingReload>(await meta(run.db, 'pending_reload'));
      if (pending) await runReload(run, pending);
      await catchUp(run);
      await compareIfDue(run);
      return;
    } catch (error) {
      if (error instanceof RestartLoadError) {
        await write(run, clearData);
        publish({ phase: 'empty', asOf: null });
        continue;
      }
      if (error instanceof ReloadAllError) {
        await reloadAll(run, error.reason);
        continue;
      }
      throw error;
    }
  }
}

async function readOffline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return isOfflineState(state, getLanStatus());
  } catch {
    // Not knowing is not offline: the request itself will tell.
    return false;
  }
}

/** The feature is off for this session: no copy, today's banner (criterion 14). */
async function turnOff(): Promise<void> {
  clearScheduleTimer();
  setCurrent(false);
  await eraseCopyFiles();
  resetSyncSnapshot({ feature: 'off' });
}

/** The copy of this run, its state published when the open at start failed or left that to the run. */
async function openForRun(scope: string, epoch: number, offline: boolean): Promise<CopyDriver> {
  const publishWhenPending = async (db: CopyDriver) => {
    if (epoch === engine.epoch && getSyncSnapshot().pending) await publishFromMeta(db, offline);
    return db;
  };
  try {
    return await publishWhenPending(await openCopy(scope));
  } catch (error) {
    // The file is kept and the open is tried again, whatever the error was.
    noteOpenError(epoch, error);
    throw error;
  }
}

/**
 * The copy's key could not be read (WH-365). After 3 failed reads in a row, one of them after a fresh start, and only
 * online, a new key is written and then the old file goes (replaceWithEmptyCopy), and the copy loads again with the
 * bar's first-load state. The sign-in, the facility and unsent work are not touched. Null: nothing replaced.
 */
async function replaceForUnreadableKey(scope: string, epoch: number, offline: boolean): Promise<CopyDriver | null> {
  const due = await recordCopyKeyReadTry();
  if (!due || offline || epoch !== engine.epoch) return null;
  try {
    const db = await replaceWithEmptyCopy(scope);
    await resetCopyKeyReadTries();
    if (epoch === engine.epoch) {
      publish({ pending: true, openFailed: false });
      await publishFromMeta(db, false);
    }
    return db;
  } catch {
    // The new key could not be written: the old file and key are as they were, and the next run counts again.
    return null;
  }
}

async function runOnce(): Promise<SyncOutcome> {
  const epoch = engine.epoch;
  const scope = await getSessionCacheScope();
  if (epoch !== engine.epoch) return 'stopped';
  const offline = await readOffline();
  setCopyOffline(offline);
  // Offline the copy is still opened when the bar does not yet know what is on the phone.
  if (offline && !getSyncSnapshot().pending) return 'offline';
  let db: CopyDriver;
  try {
    // The session could not be read just now (secure storage): nothing is decided, and the run is tried again.
    if (!scope) throw new SyncFailedError('session not read');
    db = await openForRun(scope, epoch, offline);
  } catch (error) {
    logger.warn('The copy could not be opened');
    const replaced = scope && error instanceof CopyKeyUnreadableError ? await replaceForUnreadableKey(scope, epoch, offline) : null;
    if (!replaced) {
      noteOpenFailed(epoch);
      publish({ lastRunFailed: true });
      return 'failed';
    }
    db = replaced;
  }
  if (epoch !== engine.epoch) return 'stopped';
  if (offline) return 'offline';
  if (!scope) return 'failed';
  const run: Run = { epoch, scope, stop: engine.stop.promise, db, reloadedAll: false };
  try {
    await work(run);
    engine.writeFailures = 0;
    publish({ lastRunFailed: false, running: null, pending: false });
    setCurrent(!engine.offline);
    noteStorage(run.db, true);
    publishCopyChanges();
    return 'done';
  } catch (error) {
    if (error instanceof SyncStoppedError || epoch !== engine.epoch) {
      publish({ running: null });
      return 'stopped';
    }
    if (error instanceof SyncUnsupportedError || error instanceof FeatureOffError) {
      if (error instanceof SyncUnsupportedError) noteRpcSupport('sync', false);
      logger.info('The server has no phone copy for this app: the feature is off');
      await turnOff();
      return 'off';
    }
    publish({ running: null });
    if (error instanceof SyncSessionEndedError) {
      // Today's forced sign-out ends the session and erases the copy; nothing more is asked meanwhile.
      engine.halted = true;
      clearScheduleTimer();
      return 'stopped';
    }
    if (isDiskFull(error)) publish({ storageLow: true });
    else if (!(error instanceof SyncFailedError) && !(error instanceof SyncRefusedError)) {
      engine.writeFailures += 1;
      logger.error('A write to the phone copy failed', error instanceof Error ? error.name : 'unknown');
    }
    publish({ lastRunFailed: true, pending: false });
    return 'failed';
  }
}

/** One run; after a failed open it is marked as the retry for as long as it lasts. */
async function runMarkingRetry(): Promise<SyncOutcome> {
  if (!getSyncSnapshot().openFailed) return runOnce();
  publish({ openRetrying: true });
  try {
    return await runOnce();
  } finally {
    if (getSyncSnapshot().openRetrying) publish({ openRetrying: false });
  }
}

// ---------- schedule (contract 6.6) ----------

function clearScheduleTimer(): void {
  if (engine.timer) clearTimeout(engine.timer);
  engine.timer = null;
}

function scheduleAfter(outcome: SyncOutcome): void {
  clearScheduleTimer();
  if (!engine.schedule || !engine.started || engine.halted || !engine.foreground) return;
  // Offline nothing is scheduled, except another try at a copy that could not be opened.
  if (engine.offline && !getSyncSnapshot().pending) return;
  let wait: number | null = null;
  if (outcome === 'done') {
    engine.backoff = 0;
    wait = INTERVAL_MS;
  } else if (outcome === 'failed') {
    wait = BACKOFF_MS[Math.min(engine.backoff, BACKOFF_MS.length - 1)];
    engine.backoff += 1;
  }
  if (wait === null) return;
  engine.timer = later(wait, () => {
    engine.timer = null;
    void syncNow('interval');
  });
}

// ---------- public ----------

/** Session ready and the feature on: opens the copy and publishes what it holds. Makes no request. */
export async function startPhoneCopy(): Promise<void> {
  if (engine.started) return;
  engine.started = true;
  engine.halted = false;
  const epoch = engine.epoch;
  const scope = await getSessionCacheScope();
  // Stopped or erased while the session was read: nothing is opened, or made, after that.
  if (epoch !== engine.epoch) return;
  if (!scope) {
    // The session could not be read just now: the run that follows tries again.
    noteOpenFailed(epoch);
    return;
  }
  try {
    const db = await openCopy(scope);
    await publishFromMeta(db, await readOffline());
  } catch (error) {
    // The run that follows tries again (and again after it, as after any failed run).
    logger.warn('The copy could not be opened');
    noteOpenError(epoch, error);
    noteOpenFailed(epoch);
  }
}

/** Drops the request in flight, waits for a local transaction to end, cancels the timers. Keeps the file. */
export async function stopPhoneCopy(): Promise<void> {
  engine.started = false;
  engine.again = false;
  engine.epoch += 1;
  engine.stop.fire();
  engine.stop = makeStop();
  clearScheduleTimer();
  const running = engine.run;
  if (running) await running.catch(() => undefined);
  // A load that was cut off is not "not ready" on the next return: the bar waits for the run that resumes it.
  publish(isReadablePhase(getSyncSnapshot().phase) ? { running: null } : { running: null, pending: true });
  setCurrent(false);
}

/** Runs a sync now, or after the one in progress (single flight). */
export async function syncNow(trigger: SyncTrigger): Promise<SyncOutcome> {
  if (!engine.started || engine.halted) return 'stopped';
  if (getSyncSnapshot().feature === 'off') return 'off';
  if (engine.run) {
    // "Try again" while a run is going does nothing (its button is disabled).
    if (trigger !== 'retry') engine.again = true;
    return 'busy-queued';
  }
  if (trigger === 'retry' || trigger === 'reconnect') engine.backoff = 0;
  clearScheduleTimer();
  const epoch = engine.epoch;
  const running = runMarkingRetry();
  engine.run = running;
  let outcome: SyncOutcome;
  try {
    outcome = await running;
  } finally {
    if (engine.run === running) engine.run = null;
  }
  if (epoch !== engine.epoch) return outcome;
  if (outcome === 'done') {
    // A listener that works (WH-304: the held rows are read, an opened rejection is sent) is waited for, so what a caller reads after the run is current.
    for (const listener of [...engine.runEndListeners]) {
      try {
        await listener();
      } catch (error) {
        logger.warn('A listener of the end of a sync run failed', loggableError(error));
      }
    }
  }
  if (engine.again && outcome !== 'off' && outcome !== 'stopped') {
    engine.again = false;
    void syncNow('interval');
  } else {
    engine.again = false;
    scheduleAfter(outcome);
  }
  return outcome;
}

/** Phase 'ready', and the feature not off. */
export function isCopyReadable(): boolean {
  const snapshot = getSyncSnapshot();
  return snapshot.feature !== 'off' && snapshot.phase === 'ready';
}

/** PhoneCopyLifecycle: the interval and the waits after a failure run only while it is mounted. */
export function setSyncSchedule(on: boolean): void {
  engine.schedule = on;
  if (!on) clearScheduleTimer();
}

/** PhoneCopyLifecycle: the app's foreground. */
export function setCopyForeground(active: boolean): void {
  engine.foreground = active;
  if (!active) clearScheduleTimer();
}

/** The connection: offline the copy is never current and nothing is scheduled. */
export function setCopyOffline(offline: boolean): void {
  const changed = engine.offline !== offline;
  engine.offline = offline;
  if (offline) {
    if (!getSyncSnapshot().pending) clearScheduleTimer();
    setCurrent(false);
  }
  if (changed) for (const listener of [...engine.offlineListeners]) listener();
}

/** The connection as the engine was last told (WH-299: the read route uses it, with no second NetInfo listener). */
export function isCopyOffline(): boolean {
  return engine.offline;
}

/** Told after each sync run that ended well (WH-301: the 'sync' trigger of the send engine). */
export function subscribeSyncRunEnd(listener: () => void | Promise<void>): () => void {
  engine.runEndListeners.add(listener);
  return () => {
    engine.runEndListeners.delete(listener);
  };
}

export function subscribeCopyOffline(listener: () => void): () => void {
  engine.offlineListeners.add(listener);
  return () => {
    engine.offlineListeners.delete(listener);
  };
}

setBeforeErase(async () => {
  await stopPhoneCopy();
  forgetCopyChanges();
  engine.halted = false;
  engine.backoff = 0;
  engine.writeFailures = 0;
});
