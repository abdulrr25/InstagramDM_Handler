// SQLite storage. Single file at ./data/inbox.db (path configurable).
// Two tables, kept deliberately separate:
//   messages         — one row per DM, plus the human label (never model-written)
//   classifications  — append-only log of model verdicts, so a re-run can be
//                      compared against what the model said before.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';
import type { Message } from './types.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  _db = db;
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id  TEXT NOT NULL UNIQUE,
      thread_id    TEXT NOT NULL,
      sender_json  TEXT NOT NULL,
      text         TEXT NOT NULL,
      raw_json     TEXT NOT NULL,
      received_at  TEXT NOT NULL,          -- ISO 8601 UTC
      status       TEXT NOT NULL DEFAULT 'new',
      human_route  TEXT                     -- nullable; the human label
    );

    CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at);
    CREATE INDEX IF NOT EXISTS idx_messages_human_route ON messages(human_route);

    CREATE TABLE IF NOT EXISTS classifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      route       TEXT NOT NULL,
      confidence  REAL NOT NULL,
      reason      TEXT NOT NULL,
      model       TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_class_message_id ON classifications(message_id);
  `);
}

/** Most recent received_at in the store, or null when empty. */
export function getLatestReceivedAt(): Date | null {
  const db = getDb();
  const row = db
    .prepare('SELECT MAX(received_at) AS max FROM messages')
    .get() as { max: string | null };
  return row.max ? new Date(row.max) : null;
}

/**
 * Insert a batch of messages, deduping on external_id. Returns how many were
 * newly inserted (overlapping poll windows re-send messages we already have).
 */
export function insertMessages(messages: Message[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO messages (external_id, thread_id, sender_json, text, raw_json, received_at)
    VALUES (@external_id, @thread_id, @sender_json, @text, @raw_json, @received_at)
    ON CONFLICT(external_id) DO NOTHING
  `);

  const insertMany = db.transaction((rows: Message[]) => {
    let inserted = 0;
    for (const m of rows) {
      const res = stmt.run({
        external_id: m.external_id,
        thread_id: m.thread_id,
        sender_json: JSON.stringify(m.sender),
        text: m.text,
        raw_json: JSON.stringify(m.raw),
        received_at: m.received_at.toISOString(),
      });
      inserted += res.changes;
    }
    return inserted;
  });

  return insertMany(messages);
}
