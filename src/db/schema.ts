import type { Database } from 'sql.js';
import { getDb, persist } from './database';

/**
 * Schema statements for the cahier database, in dependency order.
 * Each statement is executed individually so this works regardless of how
 * sql.js handles multi-statement strings.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS scripts (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, alignment TEXT NOT NULL, summary TEXT, ability_text TEXT, image_url TEXT)`,
  `CREATE TABLE IF NOT EXISTS character_scripts (character_id TEXT NOT NULL REFERENCES characters(id), script_id TEXT NOT NULL REFERENCES scripts(id), PRIMARY KEY (character_id, script_id))`,
  `CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, name TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', winner TEXT, script_id TEXT, phase TEXT NOT NULL DEFAULT 'night-1', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), seat INTEGER NOT NULL, name TEXT NOT NULL, character_id TEXT REFERENCES characters(id), alive INTEGER NOT NULL DEFAULT 1, on_block INTEGER NOT NULL DEFAULT 0, on_block_votes INTEGER, UNIQUE (game_id, seat))`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), seq INTEGER NOT NULL, phase TEXT NOT NULL, type TEXT NOT NULL, actor_player_id TEXT, target_player_id TEXT, payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, UNIQUE (game_id, seq))`,
  `CREATE INDEX IF NOT EXISTS idx_events_game ON events(game_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id, seat)`,
];

/**
 * Apply the full schema to a database. Idempotent: every statement uses
 * IF NOT EXISTS, so it is safe to run on both fresh and existing databases.
 * After creating tables, runs additive migrations for columns that databases
 * created by earlier versions may be missing (script_id on games, image_url
 * on characters, phase on games, alive/on_block/on_block_votes on players).
 * Existing rows keep their data; new columns get sensible defaults.
 */
export function applySchema(db: Database): void {
  for (const statement of SCHEMA_STATEMENTS) {
    db.run(statement);
  }
  migrate(db);
}

/** Async convenience wrapper: apply the schema to the app database and persist it. */
export async function initSchema(): Promise<void> {
  const db = await getDb();
  applySchema(db);
  await persist();
}

/** Add columns that databases created by earlier versions may be missing. */
function migrate(db: Database): void {
  addColumnIfMissing(db, 'games', 'script_id', 'TEXT');
  addColumnIfMissing(db, 'characters', 'image_url', 'TEXT');
  addColumnIfMissing(db, 'games', 'phase', "TEXT NOT NULL DEFAULT 'night-1'");
  addColumnIfMissing(db, 'players', 'alive', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'players', 'on_block', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'players', 'on_block_votes', 'INTEGER');
}

function columnExists(db: Database, table: string, column: string): boolean {
  const result = db.exec(`PRAGMA table_info(${table})`);
  const rows = result[0]?.values ?? [];
  // PRAGMA table_info returns [cid, name, type, notnull, dflt_value, pk]; the
  // column name is at index 1.
  return rows.some((r) => r[1] === column);
}

function addColumnIfMissing(db: Database, table: string, column: string, definition: string): void {
  if (!columnExists(db, table, column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
