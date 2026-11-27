/**
 * The file of work saved on the phone and not yet sent (WH-301, product/tech/app-offline-unsent-work.md section 1).
 *
 * Not encrypted (owner, 2026-11-26): it is the only copy of the work, and a lost key would lose it. It lives in the app's
 * private documents folder, is excluded from backups (Android: plugins/with-data-extraction-rules.js; iOS: plugins/with-ios-backup-exclusion.js) and is never erased by a
 * sign-out, a facility switch or a key problem. Later versions migrate in place, never erase.
 */
export const UNSENT_SCHEMA_VERSION = 2;

/**
 * In-place steps after version 1, each run once on a file below its version (never an erase). Version 2 is the one step
 * WH-161 and WH-304 share: `form_row` (WH-161: the unfinished form a saved new record came from, kept on the phone so a refusal
 * during the Save wait can hand it back; never sent, never part of a body), `held_id` (WH-304: the id the server gave the item
 * when it holds it) and `handover_failed` (WH-304: 1 once a hand-over attempt did not end held).
 */
export const SCHEMA_STEPS: readonly { version: number; statements: readonly string[] }[] = [
  {
    version: 2,
    statements: [
      'ALTER TABLE items ADD COLUMN form_row TEXT',
      'ALTER TABLE items ADD COLUMN held_id TEXT',
      'ALTER TABLE items ADD COLUMN handover_failed INTEGER NOT NULL DEFAULT 0',
    ],
  },
];

/** The folder under the app's documents folder that holds the file and, in `photos/`, its photo files. */
export const UNSENT_FOLDER = 'unsent-work';
export const UNSENT_PHOTO_FOLDER = 'photos';
export const UNSENT_FILE = 'unsent-work.db';

/** Statements that make the file, one after the other. `IF NOT EXISTS`: running them again changes nothing. */
export const SCHEMA_STATEMENTS: readonly string[] = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL UNIQUE,
    scope TEXT NOT NULL,
    recorder_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    request_key TEXT NOT NULL UNIQUE,
    body TEXT NOT NULL,
    depends_on TEXT,
    target_ref TEXT,
    what TEXT NOT NULL,
    customer TEXT,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    first_sent_at INTEGER,
    last_sent_at INTEGER,
    last_error TEXT,
    recorded_at INTEGER NOT NULL,
    recorded_tick INTEGER NOT NULL,
    result TEXT,
    sent_day TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS item_photos (
    item_id TEXT NOT NULL,
    file TEXT NOT NULL,
    client_photo_id TEXT NOT NULL,
    role TEXT NOT NULL,
    line_ref TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    missing INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, client_photo_id)
  )`,
  `CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    grn_id TEXT,
    state TEXT NOT NULL,
    photos TEXT,
    customer TEXT,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (scope, kind, grn_id)
  )`,
  'CREATE INDEX IF NOT EXISTS items_scope_state ON items (scope, state)',
];
