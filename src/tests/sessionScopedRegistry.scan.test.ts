/**
 * Every module under src/services, src/features, src/utils, src/hooks and src/config that holds module-level state must
 * either register its clear function with the session registry (src/config/sessionScopedRegistry.ts) or be on ALLOWED
 * below with the reason it may outlive a session. A new cache added without either fails here and names the file.
 *
 * What the scan sees: at column 0, `const|let|var x = new Map()/Set()/WeakMap()/WeakSet()`, `= {}`,
 * `= Object.create(null)`, and `let x[: T] = null|undefined`. It does not see arrays, state kept in a closure or a class,
 * state assigned later (`x = new Map()` inside a function), or a Map filled at declaration. A file that holds some and
 * registers one of them is trusted for the others: review it when it changes.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SCANNED = ['src/services', 'src/features', 'src/utils', 'src/hooks', 'src/config'];
const SOURCE = /\.(ts|tsx)$/;
const TEST_FILE = /(\.test\.|\.spec\.|[\\/]__tests__[\\/]|[\\/]__mocks__[\\/])/;
const MODULE_STATE =
  /^(?:export\s+)?(?:(?:const|let|var)\s+\w+\s*(?::[^=]+)?=\s*(?:new\s+(?:Map|Set|WeakMap|WeakSet)\b[^(]*\(\s*\)|\{\s*\}|Object\.create\(null\))|let\s+\w+\s*(?::[^=]+)?=\s*(?:null|undefined)\s*;)/m;
const REGISTERS = /registerSessionScoped\(/;

/** File (relative to the repo) -> why its module-level state may outlive a session, and the clear functions (if any) that src/store/sessionScopedState.ts must register for the reason to hold. */
const ALLOWED: Record<string, { why: string; clearedBy?: readonly string[] }> = {
  'src/services/stock-service.ts': {
    why: "facilitiesWithoutItemSort: which facility backends lack a sort parameter; a fact about the server, kept for the run of the app",
  },
  'src/services/unfinishedSaves.ts': {
    why: "startedThisRun: request codes written this run, so the start-up check leaves them to the saving screen; no personal data, and the notes survive a teardown on purpose",
  },
  'src/services/unfinishedSaveCheck.ts': {
    why: "running: the check in progress, tagged with its session generation; a session change ends it at its next step",
  },
  'src/services/rateStartFloor.ts': {
    why: "floor: the earliest date the rate editor offers; cleared by clearRateStartFloor, which src/store/sessionScopedState.ts registers", clearedBy: ["clearRateStartFloor"],
  },
  'src/features/reports/useReportExport.ts': {
    why: "outdatedFacilities: which facility backends lack generate-report-pdf, kept for the run; listeners: screen subscriptions removed on unmount",
  },
  'src/features/dispatch/utils/openDispatchForms.ts': {
    why: "open: forms currently mounted; each removes itself when its layout closes",
  },
  'src/features/invoice/utils/openInvoiceForms.ts': {
    why: "open: forms currently mounted; each removes itself when its layout closes",
  },
  'src/features/filters/recentSearches.ts': {
    why: "recentByList: cleared by forgetRecentSearches, which src/store/sessionScopedState.ts registers", clearedBy: ["forgetRecentSearches"],
  },
  'src/features/item-pricing/useItemRates.ts': {
    why: "inFlightItem, appliedRead, snapshot, inFlight*: cleared by clearItemRatesCache, which src/store/sessionScopedState.ts registers; subscribers: screen subscriptions; EMPTY_*: shared empty constants", clearedBy: ["clearItemRatesCache"],
  },
  'src/features/item-pricing/useStandardRate.ts': {
    why: "snapshot, inFlight*: cleared by clearStandardRateCache, which src/store/sessionScopedState.ts registers; subscribers: screen subscriptions", clearedBy: ["clearStandardRateCache"],
  },
  'src/features/item-pricing/contract.ts': {
    why: "listeners: screen subscriptions; changeCounts: per-item counters that only grow (a reset could make a stale read look fresh), item ids only",
  },
  'src/features/settings/preferenceSheetMemory.ts': {
    why: "reopen: the name of a preferences sheet, held for one rebuild of the navigation tree; no facility data",
  },
  'src/features/invoice/components/items/InvoiceItemsEditor.tsx': {
    why: "EMPTY_MAP, NO_LINES: shared empty constants that keep a prop reference stable, never written",
  },
  'src/features/filters/useListFilters.ts': {
    why: "NO_SEARCHES, NO_LITERALS: shared empty constants that keep a reference stable, never written",
  },
  'src/features/dispatch/screens/DispatchItemsStep.tsx': {
    why: "NO_HELD_BAGS, NO_ORDER_LOTS: shared empty constants that keep a reference stable, never written",
  },
  'src/features/orders/pickerDraft.ts': {
    why: "NO_REASONS: shared empty constant that keeps a reference stable, never written",
  },
  'src/utils/formatters.ts': {
    why: "indianFormats: Intl.NumberFormat objects by locale; no data",
  },
  'src/utils/userListSync.ts': {
    why: "listeners: screen subscriptions",
  },
  'src/utils/submissionIdempotency.ts': {
    why: "grnEditSession: the GRN id and a random id of one edit session, renewed on load and after each save; no personal data",
  },
  'src/utils/alert.ts': {
    why: "listener, queue, queueListeners: the dialog host and its queue; dialogs with handlers are dropped by dropAlertsWithHandlers, which src/store/sessionScopedState.ts registers", clearedBy: ["dropAlertsWithHandlers"],
  },
  'src/utils/cacheManager.ts': {
    why: "boundedCacheQueues: write operations in flight on the bounded caches; the caches themselves are cleared by clearAllCaches, which src/store/sessionScopedState.ts registers", clearedBy: ["clearAllCaches"],
  },
  'src/utils/signInDraft.ts': {
    why: "draft: the phone number typed on the sign-in screen, in memory only, for one facility; it exists before a session does and is cleared after sign-in and when the screen is left",
  },
  'src/utils/shareDocument.ts': {
    why: "pendingCleanups: timers that delete shared documents; sweepSharedDocuments, which src/store/sessionScopedState.ts registers, deletes them", clearedBy: ["sweepSharedDocuments"],
  },
  'src/utils/toast.ts': {
    why: "listener: the toast host",
  },
  'src/utils/serviceErrorHandler.ts': {
    why: "_store, _forceLogoutOnInvalidToken: references wired once at start-up, not data",
  },
  'src/utils/localPhotoFiles.ts': {
    why: "holds, awaitingRetry, deferred, abandoned, registering, background: the photo-file registry; released by releaseLocalPhotosOwnedBy, which src/store/sessionScopedState.ts registers", clearedBy: ["releaseLocalPhotosOwnedBy"],
  },
  'src/hooks/useInvoiceForm.ts': {
    why: "NO_OVERRIDES: shared empty constant that keeps a reference stable, never written",
  },
  'src/hooks/useDispatchForm.ts': {
    why: "NO_HELD_BAGS, NO_ORDER_LOTS: shared empty constants that keep a reference stable, never written",
  },
  'src/hooks/useTheme.ts': {
    why: "styleCache: styles by theme tokens in a WeakMap; no data",
  },
  'src/config/centralState.ts': {
    why: "listeners: subscriptions to the central login state",
  },
  'src/config/facilityCapabilities.ts': {
    why: "byServer: capabilities by facility server (a fact about the server); listeners: subscriptions",
  },
  'src/config/backendFeatures.ts': {
    why: "byServer: the release (backendRelease, schemaHead) each facility server last reported, by server; a fact about the server, not the session, so it outlives a sign-out on the same facility",
  },
  'src/config/lanCheck.ts': {
    why: "listeners: subscriptions; checking: the check in progress",
  },
  'src/config/openFacility.ts': {
    why: "openingFacility: the open in progress (file owned by another PR)",
  },
  'src/config/sessionLifecycle.ts': {
    why: "listeners: the session-change listeners themselves",
  },
  'src/config/staleFacilitySession.ts': {
    why: "generations: session generations by facility for this run of the app, used to tell a stale session; no data",
  },
  'src/config/facilityGrnPaging.ts': {
    why: "byServer, learnedFrom: a fact about the facility server (paging support), by server; listeners: subscriptions",
  },
  'src/config/operatorServer.ts': {
    why: "activeServer, listeners: the facility in use and subscriptions to it (file owned by another PR)",
  },
  'src/config/centralFacilities.ts': {
    why: "listeners: subscriptions",
  },
  'src/config/netInfoGeneration.ts': {
    why: "listeners: subscriptions",
  },
  'src/config/lanTransport.ts': {
    why: "connection-path state and listeners; reset by resetLanTransport on a facility change (file owned by another PR)",
  },
  'src/config/centralSession.ts': {
    why: "refreshInFlight, lastRefresh, catalogueCache: the central (identity) session, which is not a facility session and has its own sign-out",
  },
  'src/config/supabaseConfig.ts': {
    why: "activeRequests; storedSessionCache is invalidated through onSessionChange (file owned by another PR)",
  },
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE.test(entry.name) && !TEST_FILE.test(full) ? [full] : [];
  });
}

const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const holders = SCANNED.flatMap(dir => sourceFiles(path.join(ROOT, dir)))
  .filter(file => MODULE_STATE.test(fs.readFileSync(file, 'utf8')))
  .map(file => path.relative(ROOT, file).split(path.sep).join('/'))
  // The registry is the list itself.
  .filter(file => file !== 'src/config/sessionScopedRegistry.ts');

describe('module-level state outside the Redux store', () => {
  it('finds the modules that hold some', () => {
    expect(holders.length).toBeGreaterThanOrEqual(40);
    expect(holders).toContain('src/services/grn-service.ts');
    expect(holders).toContain('src/utils/requestDedup.ts');
  });

  it('is registered with the session registry or allow-listed, for every module', () => {
    const unaccounted = holders.filter(file => !REGISTERS.test(read(file)) && !(file in ALLOWED));
    expect(unaccounted).toEqual([]);
  });

  it('lists in the allow-list only files that still hold state and do not register', () => {
    const stale = Object.keys(ALLOWED).filter(file => !holders.includes(file) || REGISTERS.test(read(file)));
    expect(stale).toEqual([]);
  });

  it('has a registration in sessionScopedState.ts for every clear function an allow-list reason relies on', () => {
    const teardown = read('src/store/sessionScopedState.ts');
    const unregistered = Object.entries(ALLOWED).flatMap(([file, { clearedBy = [] }]) =>
      clearedBy
        .filter(fn => !new RegExp(`registerSessionScoped\\('[^']+',(?:(?!registerSessionScoped)[\\s\\S])*?\\b${fn}\\(`).test(teardown))
        .map(fn => `${file}: ${fn}`)
    );
    expect(unregistered).toEqual([]);
  });

  it('names clear functions that the module really exports', () => {
    const missing = Object.entries(ALLOWED).flatMap(([file, { clearedBy = [] }]) =>
      clearedBy.filter(fn => !new RegExp(`export (?:async )?(?:function|const) ${fn}\\b`).test(read(file))).map(fn => `${file}: ${fn}`)
    );
    expect(missing).toEqual([]);
  });
});
